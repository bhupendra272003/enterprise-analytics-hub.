import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
import { pool } from '../db.js';
import { config } from '../config.js';
import { audit } from '../audit.js';
import { requireAuth, requireActiveUser, requireRole } from '../middleware.js';

const router=Router();
router.use(requireAuth,requireActiveUser);
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:15*1024*1024,files:1},fileFilter:(req,file,cb)=>{
  if(path.extname(file.originalname).toLowerCase()!=='.csv')return cb(new Error('Only CSV files are supported.'));
  cb(null,true);
}});
const datasetRole=requireRole('OWNER','ADMIN','MANAGER','ANALYST');

router.get('/organizations/:orgId/datasets',requireRole('OWNER','ADMIN','MANAGER','ANALYST','VIEWER'),async(req,res,next)=>{
  try{
    const [rows]=await pool.execute('SELECT id,name,original_filename AS originalFilename,file_size AS fileSize,row_count AS rowCount,column_count AS columnCount,created_at AS createdAt,u.full_name AS uploadedBy FROM datasets d JOIN users u ON u.id=d.uploaded_by WHERE d.organization_id=? ORDER BY d.created_at DESC',[req.params.orgId]);
    res.json({datasets:rows});
  }catch(e){next(e);}
});

router.post('/organizations/:orgId/datasets',datasetRole,upload.single('file'),async(req,res,next)=>{
  let storedPath;
  try{
    if(!req.file)return res.status(400).json({error:'Choose a CSV file to upload.'});
    const input=z.object({name:z.string().trim().min(2).max(120)}).parse(req.body);
    const records=parse(req.file.buffer,{columns:true,skip_empty_lines:true,bom:true,trim:true,relax_column_count:false,skip_records_with_error:false});
    if(!records.length)return res.status(400).json({error:'The CSV contains a header but no data rows.'});
    const columns=Object.keys(records[0]);
    if(!columns.length||columns.some(c=>!c.trim()))return res.status(400).json({error:'The CSV must contain valid column headers.'});
    if(columns.length>200)return res.status(400).json({error:'CSV files may contain at most 200 columns.'});
    const preview=records.slice(0,10).map(record=>Object.fromEntries(columns.map(column=>[column,String(record[column]??'').slice(0,500)])));
    const id=randomUUID();
    const root=path.resolve(config.dataStorageDir);
    await mkdir(root,{recursive:true});
    storedPath=path.join(root,id+'.csv');
    await writeFile(storedPath,req.file.buffer,{flag:'wx',mode:0o600});
    await pool.execute('INSERT INTO datasets (id,organization_id,name,original_filename,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [id,req.params.orgId,input.name,path.basename(req.file.originalname).slice(0,255),storedPath,req.file.size,records.length,columns.length,JSON.stringify(columns),JSON.stringify(preview),req.user.id]);
    await pool.execute('INSERT INTO dataset_versions (id,dataset_id,version_number,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by,change_note) VALUES (?,?,1,?,?,?,?,?,?,?,?)',
      [randomUUID(),id,storedPath,req.file.size,records.length,columns.length,JSON.stringify(columns),JSON.stringify(preview),req.user.id,'Initial source upload']);
    await audit({orgId:req.params.orgId,actorId:req.user.id,action:'DATASET_UPLOADED',targetType:'DATASET',targetId:id,metadata:{name:input.name,rowCount:records.length,columnCount:columns.length},ip:req.ip});
    res.status(201).json({dataset:{id,name:input.name,rowCount:records.length,columnCount:columns.length,columns,preview}});
  }catch(e){if(storedPath)await unlink(storedPath).catch(()=>{});if(e?.code?.startsWith('CSV_'))return res.status(400).json({error:'The CSV file is invalid. Check its header and row structure.'});next(e);}
});

router.get('/datasets/:datasetId/versions',async(req,res,next)=>{
  try{
    const [dataset]=await pool.execute('SELECT organization_id FROM datasets WHERE id=? LIMIT 1',[req.params.datasetId]);
    if(!dataset.length)return res.status(404).json({error:'Dataset not found.'});
    const [membership]=await pool.execute("SELECT id FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",[dataset[0].organization_id,req.user.id]);
    if(!membership.length)return res.status(403).json({error:'Insufficient organization permissions.'});
    const [versions]=await pool.execute('SELECT v.id,v.version_number AS versionNumber,v.file_size AS fileSize,v.row_count AS rowCount,v.column_count AS columnCount,v.change_note AS changeNote,v.created_at AS createdAt,u.full_name AS uploadedBy FROM dataset_versions v JOIN users u ON u.id=v.uploaded_by WHERE v.dataset_id=? ORDER BY v.version_number DESC',[req.params.datasetId]);
    res.json({versions});
  }catch(e){next(e);}
});

router.get('/datasets/:datasetId/preview',async(req,res,next)=>{
  try{
    const [rows]=await pool.execute('SELECT d.id,d.name,d.columns_json AS columnsJson,d.preview_json AS previewJson,d.organization_id FROM datasets d WHERE d.id=? LIMIT 1',[req.params.datasetId]);
    if(!rows.length)return res.status(404).json({error:'Dataset not found.'});
    const [membership]=await pool.execute("SELECT id FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'",[rows[0].organization_id,req.user.id]);
    if(!membership.length)return res.status(403).json({error:'Insufficient organization permissions.'});
    const columns=typeof rows[0].columns_json==='string'?JSON.parse(rows[0].columns_json):rows[0].columns_json;
    const preview=typeof rows[0].preview_json==='string'?JSON.parse(rows[0].preview_json):rows[0].preview_json;
    res.json({dataset:{id:rows[0].id,name:rows[0].name,columns,preview}});
  }catch(e){next(e);}
});


router.get('/datasets/:datasetId/profile',async(req,res,next)=>{
  try{
    const [rows]=await pool.execute('SELECT id,name,storage_path,organization_id FROM datasets WHERE id=? LIMIT 1',[req.params.datasetId]);
    if(!rows.length)return res.status(404).json({error:'Dataset not found.'});
    const [membership]=await pool.execute("SELECT id FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'",[rows[0].organization_id,req.user.id]);
    if(!membership.length)return res.status(403).json({error:'Insufficient organization permissions.'});
    const raw=await readFile(rows[0].storage_path);
    const records=parse(raw,{columns:true,skip_empty_lines:true,bom:true,trim:true,relax_column_count:false});
    const columns=Object.keys(records[0]||{});
    const profile=columns.map(name=>{
      const values=records.map(row=>String(row[name]??'').trim());
      const present=values.filter(v=>v!=='');
      const numeric=present.map(Number).filter(Number.isFinite);
      const numericType=present.length>0&&numeric.length/present.length>=0.9;
      const distinct=new Set(present).size;
      return {name,type:present.length===0?'EMPTY':numericType?'NUMERIC':'TEXT',total:values.length,missing:values.length-present.length,distinct,...(numericType?{min:numeric.reduce((a,b)=>Math.min(a,b),Infinity),max:numeric.reduce((a,b)=>Math.max(a,b),-Infinity),mean:Number((numeric.reduce((a,b)=>a+b,0)/numeric.length).toFixed(3))}:{})};
    });
    res.json({profile:{datasetId:rows[0].id,name:rows[0].name,rowCount:records.length,columnCount:columns.length,columns:profile}});
  }catch(e){next(e);}
});

export default router;
