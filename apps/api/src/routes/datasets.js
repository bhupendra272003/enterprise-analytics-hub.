import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
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
    const id=randomUUID();
    const root=path.resolve(config.dataStorageDir);
    await mkdir(root,{recursive:true});
    storedPath=path.join(root,id+'.csv');
    await writeFile(storedPath,req.file.buffer,{flag:'wx',mode:0o600});
    await pool.execute('INSERT INTO datasets (id,organization_id,name,original_filename,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [id,req.params.orgId,input.name,path.basename(req.file.originalname).slice(0,255),storedPath,req.file.size,records.length,columns.length,JSON.stringify(columns),JSON.stringify(records.slice(0,10)),req.user.id]);
    await audit({orgId:req.params.orgId,actorId:req.user.id,action:'DATASET_UPLOADED',targetType:'DATASET',targetId:id,metadata:{name:input.name,rowCount:records.length,columnCount:columns.length},ip:req.ip});
    res.status(201).json({dataset:{id,name:input.name,rowCount:records.length,columnCount:columns.length,columns,preview:records.slice(0,10)}});
  }catch(e){if(storedPath)await unlink(storedPath).catch(()=>{});next(e);}
});

router.get('/datasets/:datasetId/preview',async(req,res,next)=>{
  try{
    const [rows]=await pool.execute('SELECT d.id,d.name,d.columns_json AS columnsJson,d.preview_json AS previewJson,d.organization_id FROM datasets d WHERE d.id=? LIMIT 1',[req.params.datasetId]);
    if(!rows.length)return res.status(404).json({error:'Dataset not found.'});
    const [membership]=await pool.execute("SELECT id FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE'",[rows[0].organization_id,req.user.id]);
    if(!membership.length)return res.status(403).json({error:'Insufficient organization permissions.'});
    res.json({dataset:{id:rows[0].id,name:rows[0].name,columns:rows[0].columns_json,preview:rows[0].preview_json}});
  }catch(e){next(e);}
});

export default router;
