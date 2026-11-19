import { Router } from 'express';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, unlink, readFile, copyFile } from 'node:fs/promises';
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

router.post('/datasets/:datasetId/versions',upload.single('file'),async(req,res,next)=>{
  let storedPath;
  let connection;
  try{
    if(!req.file)return res.status(400).json({error:'Choose a CSV file for the new version.'});
    const input=z.object({changeNote:z.string().trim().max(500).optional()}).parse(req.body);
    const records=parse(req.file.buffer,{columns:true,skip_empty_lines:true,bom:true,trim:true,relax_column_count:false,skip_records_with_error:false});
    if(!records.length)return res.status(400).json({error:'The CSV contains a header but no data rows.'});
    const columns=Object.keys(records[0]);
    if(!columns.length||columns.some(x=>!x.trim())||columns.length>200)return res.status(400).json({error:'The CSV must contain between 1 and 200 valid columns.'});
    const preview=records.slice(0,10).map(record=>Object.fromEntries(columns.map(column=>[column,String(record[column]??'').slice(0,500)])));
    connection=await pool.getConnection();
    await connection.beginTransaction();
    const [rows]=await connection.execute('SELECT id,organization_id FROM datasets WHERE id=? FOR UPDATE',[req.params.datasetId]);
    if(!rows.length){await connection.rollback();return res.status(404).json({error:'Dataset not found.'});}
    const [members]=await connection.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",[rows[0].organization_id,req.user.id]);
    if(!members.length||!['OWNER','ADMIN','MANAGER','ANALYST'].includes(members[0].role)){await connection.rollback();return res.status(403).json({error:'You do not have permission to upload a dataset version.'});}
    const [latest]=await connection.execute('SELECT COALESCE(MAX(version_number),0) AS currentVersion FROM dataset_versions WHERE dataset_id=?',[req.params.datasetId]);
    const versionNumber=Number(latest[0].currentVersion)+1;
    const root=path.resolve(config.dataStorageDir);
    await mkdir(root,{recursive:true});
    storedPath=path.join(root,randomUUID()+'.csv');
    await writeFile(storedPath,req.file.buffer,{flag:'wx',mode:0o600});
    await connection.execute('INSERT INTO dataset_versions (id,dataset_id,version_number,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by,change_note) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [randomUUID(),req.params.datasetId,versionNumber,storedPath,req.file.size,records.length,columns.length,JSON.stringify(columns),JSON.stringify(preview),req.user.id,input.changeNote||'Source file updated']);
    await connection.execute('UPDATE datasets SET original_filename=?,storage_path=?,file_size=?,row_count=?,column_count=?,columns_json=?,preview_json=?,uploaded_by=? WHERE id=?',
      [path.basename(req.file.originalname).slice(0,255),storedPath,req.file.size,records.length,columns.length,JSON.stringify(columns),JSON.stringify(preview),req.user.id,req.params.datasetId]);
    await connection.commit();
    storedPath=null;
    await audit({orgId:rows[0].organization_id,actorId:req.user.id,action:'DATASET_VERSION_UPLOADED',targetType:'DATASET',targetId:req.params.datasetId,metadata:{versionNumber,rowCount:records.length,columnCount:columns.length},ip:req.ip});
    res.status(201).json({version:{versionNumber,rowCount:records.length,columnCount:columns.length,columns,preview}});
  }catch(e){
    if(connection)await connection.rollback().catch(()=>{});
    if(storedPath)await unlink(storedPath).catch(()=>{});
    if(e?.code?.startsWith('CSV_'))return res.status(400).json({error:'The CSV file is invalid. Check its header and row structure.'});
    next(e);
  }finally{connection?.release();}
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

router.get('/datasets/:datasetId/versions/compare',async(req,res,next)=>{
  try{
    const from=Number(req.query.from),to=Number(req.query.to);
    if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<1||from===to)return res.status(400).json({error:'Choose two different valid version numbers.'});
    const [rows]=await pool.execute('SELECT d.organization_id,a.row_count AS fromRows,a.column_count AS fromColumns,a.columns_json AS fromSchema,b.row_count AS toRows,b.column_count AS toColumns,b.columns_json AS toSchema FROM datasets d JOIN dataset_versions a ON a.dataset_id=d.id AND a.version_number=? JOIN dataset_versions b ON b.dataset_id=d.id AND b.version_number=? WHERE d.id=? LIMIT 1',[from,to,req.params.datasetId]);
    if(!rows.length)return res.status(404).json({error:'Dataset or selected version not found.'});
    const [members]=await pool.execute("SELECT id FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",[rows[0].organization_id,req.user.id]);
    if(!members.length)return res.status(403).json({error:'Insufficient organization permissions.'});
    const parseSchema=value=>typeof value==='string'?JSON.parse(value):value;
    const oldColumns=parseSchema(rows[0].fromSchema)||[],newColumns=parseSchema(rows[0].toSchema)||[];
    res.json({comparison:{fromVersion:from,toVersion:to,fromRows:Number(rows[0].fromRows),toRows:Number(rows[0].toRows),rowDelta:Number(rows[0].toRows)-Number(rows[0].fromRows),fromColumns:Number(rows[0].fromColumns),toColumns:Number(rows[0].toColumns),addedColumns:newColumns.filter(x=>!oldColumns.includes(x)),removedColumns:oldColumns.filter(x=>!newColumns.includes(x)),unchangedColumns:oldColumns.filter(x=>newColumns.includes(x))}});
  }catch(e){next(e);}
});

router.get('/datasets/:datasetId/versions/compare/rows',async(req,res,next)=>{
  try{
    const from=Number(req.query.from),to=Number(req.query.to),key=typeof req.query.key==='string'?req.query.key.trim():'';
    if(!Number.isInteger(from)||!Number.isInteger(to)||from<1||to<1||from===to)return res.status(400).json({error:'Choose two different valid version numbers.'});
    if(!key||key.length>200)return res.status(400).json({error:'Choose a valid key column.'});
    const [rows]=await pool.execute('SELECT d.organization_id,a.storage_path AS fromPath,a.columns_json AS fromSchema,b.storage_path AS toPath,b.columns_json AS toSchema FROM datasets d JOIN dataset_versions a ON a.dataset_id=d.id AND a.version_number=? JOIN dataset_versions b ON b.dataset_id=d.id AND b.version_number=? WHERE d.id=? LIMIT 1',[from,to,req.params.datasetId]);
    if(!rows.length)return res.status(404).json({error:'Dataset or selected version not found.'});
    const [members]=await pool.execute("SELECT id FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",[rows[0].organization_id,req.user.id]);
    if(!members.length)return res.status(403).json({error:'Insufficient organization permissions.'});
    const parseSchema=value=>typeof value==='string'?JSON.parse(value):value;
    const oldColumns=parseSchema(rows[0].fromSchema)||[],newColumns=parseSchema(rows[0].toSchema)||[];
    if(!oldColumns.includes(key)||!newColumns.includes(key))return res.status(400).json({error:'The selected key column must exist in both versions.'});
    const parseOptions={columns:true,skip_empty_lines:true,bom:true,trim:true,relax_column_count:false,skip_records_with_error:false};
    const oldRecords=parse(await readFile(rows[0].fromPath),parseOptions);
    const newRecords=parse(await readFile(rows[0].toPath),parseOptions);
    const indexRecords=(records,label)=>{
      const index=new Map();
      for(const record of records){
        const value=String(record[key]??'').trim();
        if(!value)return {error:label+' contains blank values in the selected key column.'};
        if(index.has(value))return {error:label+' contains duplicate values in the selected key column. Choose a unique identifier.'};
        index.set(value,record);
      }
      return {index};
    };
    const oldIndex=indexRecords(oldRecords,'The earlier version');
    if(oldIndex.error)return res.status(400).json({error:oldIndex.error});
    const newIndex=indexRecords(newRecords,'The later version');
    if(newIndex.error)return res.status(400).json({error:newIndex.error});
    const added=[],removed=[],modified=[];
    for(const [value,record] of newIndex.index){
      if(!oldIndex.index.has(value)){
        if(added.length<20)added.push({key:value,record});
        continue;
      }
      const before=oldIndex.index.get(value);
      const changedColumns=[...new Set([...Object.keys(before),...Object.keys(record)])].filter(column=>String(before[column]??'')!==String(record[column]??''));
      if(changedColumns.length&&modified.length<20)modified.push({key:value,changedColumns,before:Object.fromEntries(changedColumns.map(column=>[column,before[column]??''])),after:Object.fromEntries(changedColumns.map(column=>[column,record[column]??'']))});
    }
    for(const [value,record] of oldIndex.index){
      if(!newIndex.index.has(value)&&removed.length<20)removed.push({key:value,record});
    }
    let addedCount=0,removedCount=0,modifiedCount=0;
    for(const value of newIndex.index.keys()){
      if(!oldIndex.index.has(value))addedCount++;
      else{
        const before=oldIndex.index.get(value),after=newIndex.index.get(value);
        if([...new Set([...Object.keys(before),...Object.keys(after)])].some(column=>String(before[column]??'')!==String(after[column]??'')))modifiedCount++;
      }
    }
    for(const value of oldIndex.index.keys())if(!newIndex.index.has(value))removedCount++;
    res.json({rowComparison:{fromVersion:from,toVersion:to,keyColumn:key,fromRows:oldRecords.length,toRows:newRecords.length,addedCount,removedCount,modifiedCount,unchangedCount:Math.max(0,oldRecords.length-removedCount-modifiedCount),sampleLimit:20,added,removed,modified}});
  }catch(e){
    if(e?.code?.startsWith('CSV_'))return res.status(400).json({error:'A stored CSV version is invalid and cannot be compared.'});
    next(e);
  }
});

router.post('/datasets/:datasetId/versions/:versionNumber/restore',async(req,res,next)=>{
  let connection,restoredPath;
  try{
    const versionNumber=Number(req.params.versionNumber);
    if(!Number.isInteger(versionNumber)||versionNumber<1)return res.status(400).json({error:'Invalid version number.'});
    connection=await pool.getConnection();
    await connection.beginTransaction();
    const [datasets]=await connection.execute('SELECT id,organization_id FROM datasets WHERE id=? FOR UPDATE',[req.params.datasetId]);
    if(!datasets.length){await connection.rollback();return res.status(404).json({error:'Dataset not found.'});}
    const [members]=await connection.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",[datasets[0].organization_id,req.user.id]);
    if(!members.length||!['OWNER','ADMIN','MANAGER','ANALYST'].includes(members[0].role)){await connection.rollback();return res.status(403).json({error:'You do not have permission to restore dataset versions.'});}
    const [source]=await connection.execute('SELECT * FROM dataset_versions WHERE dataset_id=? AND version_number=? LIMIT 1',[req.params.datasetId,versionNumber]);
    if(!source.length){await connection.rollback();return res.status(404).json({error:'Version not found.'});}
    const [latest]=await connection.execute('SELECT COALESCE(MAX(version_number),0) AS currentVersion FROM dataset_versions WHERE dataset_id=?',[req.params.datasetId]);
    const nextVersion=Number(latest[0].currentVersion)+1;
    const root=path.resolve(config.dataStorageDir);
    await mkdir(root,{recursive:true});
    restoredPath=path.join(root,randomUUID()+'.csv');
    await copyFile(source[0].storage_path,restoredPath);
    await connection.execute('INSERT INTO dataset_versions (id,dataset_id,version_number,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by,change_note) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [randomUUID(),req.params.datasetId,nextVersion,restoredPath,source[0].file_size,source[0].row_count,source[0].column_count,source[0].columns_json,source[0].preview_json,req.user.id,'Restored from version '+versionNumber]);
    await connection.execute('UPDATE datasets SET storage_path=?,file_size=?,row_count=?,column_count=?,columns_json=?,preview_json=?,uploaded_by=? WHERE id=?',
      [restoredPath,source[0].file_size,source[0].row_count,source[0].column_count,source[0].columns_json,source[0].preview_json,req.user.id,req.params.datasetId]);
    await connection.commit();
    restoredPath=null;
    await audit({orgId:datasets[0].organization_id,actorId:req.user.id,action:'DATASET_VERSION_RESTORED',targetType:'DATASET',targetId:req.params.datasetId,metadata:{restoredFrom:versionNumber,newVersion:nextVersion},ip:req.ip});
    res.status(201).json({restoredFrom:versionNumber,newVersion:nextVersion});
  }catch(e){
    if(connection)await connection.rollback().catch(()=>{});
    if(restoredPath)await unlink(restoredPath).catch(()=>{});
    next(e);
  }finally{connection?.release();}
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



router.post('/datasets/:datasetId/clean',async(req,res,next)=>{
  let connection,cleanedPath;
  try{
    const options=z.object({
      trimWhitespace:z.boolean().default(true),
      removeDuplicates:z.boolean().default(true),
      fillMissing:z.enum(['none','zero','mean','median','mode']).default('none')
    }).parse(req.body||{});
    const [datasets]=await pool.execute('SELECT id,name,organization_id,storage_path FROM datasets WHERE id=? LIMIT 1',[req.params.datasetId]);
    if(!datasets.length)return res.status(404).json({error:'Dataset not found.'});
    const [members]=await pool.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",[datasets[0].organization_id,req.user.id]);
    if(!members.length)return res.status(403).json({error:'Insufficient organization permissions.'});
    if(!['OWNER','ADMIN','MANAGER','ANALYST'].includes(members[0].role))return res.status(403).json({error:'Your role cannot create cleaned dataset versions.'});
    const root=path.resolve(config.dataStorageDir);
    await mkdir(root,{recursive:true});
    cleanedPath=path.join(root,randomUUID()+'.csv');
    const script=fileURLToPath(new URL('../../python/clean_dataset.py',import.meta.url));
    const report=await new Promise((resolve,reject)=>{
      const child=spawn(config.pythonExecutable,[script,datasets[0].storage_path,cleanedPath,JSON.stringify(options)],{stdio:['ignore','pipe','pipe'],windowsHide:true});
      let stdout='',stderr='';
      child.stdout.setEncoding('utf8');child.stderr.setEncoding('utf8');
      child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.length>5*1024*1024)child.kill();});
      child.stderr.on('data',chunk=>{stderr+=chunk;if(stderr.length>20000)stderr=stderr.slice(-20000);});
      child.on('error',reject);
      child.on('close',code=>{
        if(code!==0)return reject(new Error(stderr.trim()||'Python cleaning process failed. Check Python installation.'));
        try{resolve(JSON.parse(stdout));}catch{reject(new Error('The cleaning engine returned an invalid report.'));}
      });
    });
    const stat=await import('node:fs/promises').then(fs=>fs.stat(cleanedPath));
    const columns=report.columns||[];
    const preview=report.preview||[];
    connection=await pool.getConnection();
    await connection.beginTransaction();
    const [locked]=await connection.execute('SELECT id,organization_id FROM datasets WHERE id=? FOR UPDATE',[req.params.datasetId]);
    if(!locked.length){await connection.rollback();return res.status(404).json({error:'Dataset not found.'});}
    const [currentMembership]=await connection.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",[locked[0].organization_id,req.user.id]);
    if(!currentMembership.length||!['OWNER','ADMIN','MANAGER','ANALYST'].includes(currentMembership[0].role)){await connection.rollback();return res.status(403).json({error:'Dataset access changed while cleaning was running.'});}
    const [latest]=await connection.execute('SELECT COALESCE(MAX(version_number),0) AS currentVersion FROM dataset_versions WHERE dataset_id=?',[req.params.datasetId]);
    const versionNumber=Number(latest[0].currentVersion)+1;
    await connection.execute('INSERT INTO dataset_versions (id,dataset_id,version_number,storage_path,file_size,row_count,column_count,columns_json,preview_json,uploaded_by,change_note) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      [randomUUID(),req.params.datasetId,versionNumber,cleanedPath,stat.size,report.after.rows,columns.length,JSON.stringify(columns),JSON.stringify(preview),req.user.id,'Python cleaning · quality score '+report.before.qualityScore+' → '+report.after.qualityScore]);
    await connection.execute('UPDATE datasets SET storage_path=?,file_size=?,row_count=?,column_count=?,columns_json=?,preview_json=?,uploaded_by=? WHERE id=?',
      [cleanedPath,stat.size,report.after.rows,columns.length,JSON.stringify(columns),JSON.stringify(preview),req.user.id,req.params.datasetId]);
    await connection.commit();
    cleanedPath=null;
    await audit({orgId:locked[0].organization_id,actorId:req.user.id,action:'DATASET_CLEANED',targetType:'DATASET',targetId:req.params.datasetId,metadata:{versionNumber,beforeScore:report.before.qualityScore,afterScore:report.after.qualityScore,removedDuplicates:report.removedDuplicates,filledCells:report.filledCells},ip:req.ip});
    res.status(201).json({versionNumber,report});
  }catch(e){
    if(connection)await connection.rollback().catch(()=>{});
    if(cleanedPath)await unlink(cleanedPath).catch(()=>{});
    if(e?.message?.includes('CSV'))return res.status(400).json({error:e.message});
    if(e?.code==='ENOENT')return res.status(500).json({error:'Python was not found. Install Python 3 or set PYTHON_EXECUTABLE in the API environment.'});
    next(e);
  }finally{connection?.release();}
});


router.post('/datasets/:datasetId/validate',async(req,res,next)=>{
  try{
    const schema=z.object({
      versionNumber:z.number().int().positive().optional(),
      rules:z.object({
        required:z.array(z.string().max(200)).max(200).default([]),
        types:z.record(z.string(),z.enum(['TEXT','NUMBER','DATE','BOOLEAN'])).default({}),
        allowedValues:z.record(z.string(),z.array(z.string().max(200)).max(100)).default({}),
        numericRanges:z.record(z.string(),z.object({min:z.number().optional(),max:z.number().optional()})).default({}),
        uniqueColumns:z.array(z.string().max(200)).max(200).default([])
      }).default({})
    }).parse(req.body||{});
    const [datasets]=await pool.execute('SELECT id,name,organization_id FROM datasets WHERE id=? LIMIT 1',[req.params.datasetId]);
    if(!datasets.length)return res.status(404).json({error:'Dataset not found.'});
    const [members]=await pool.execute("SELECT role FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",[datasets[0].organization_id,req.user.id]);
    if(!members.length)return res.status(403).json({error:'Insufficient organization permissions.'});
    if(!['OWNER','ADMIN','MANAGER','ANALYST'].includes(members[0].role))return res.status(403).json({error:'Your role cannot run dataset validation.'});
    const [versions]=await pool.execute('SELECT version_number AS versionNumber,storage_path AS storagePath,columns_json AS columnsJson FROM dataset_versions WHERE dataset_id=? AND version_number=COALESCE(?,(SELECT MAX(version_number) FROM dataset_versions WHERE dataset_id=?)) LIMIT 1',[req.params.datasetId,schema.versionNumber??null,req.params.datasetId]);
    if(!versions.length)return res.status(404).json({error:'Dataset version not found.'});
    const columns=typeof versions[0].columnsJson==='string'?JSON.parse(versions[0].columnsJson):versions[0].columnsJson;
    const rules=schema.rules;
    const configured=[...new Set([...rules.required,...Object.keys(rules.types),...Object.keys(rules.allowedValues),...Object.keys(rules.numericRanges),...rules.uniqueColumns])];
    const unknown=configured.filter(column=>!columns.includes(column));
    if(unknown.length)return res.status(400).json({error:'Rules reference columns that do not exist: '+unknown.join(', ')});
    for(const [column,range] of Object.entries(rules.numericRanges)){
      if(range.min!==undefined&&range.max!==undefined&&range.min>range.max)return res.status(400).json({error:'Minimum cannot be greater than maximum for '+column+'.'});
    }
    const records=parse(await readFile(versions[0].storagePath),{columns:true,skip_empty_lines:true,bom:true,trim:false,relax_column_count:false});
    const issueCounts={REQUIRED:0,TYPE:0,ALLOWED_VALUE:0,MIN_MAX:0,UNIQUE:0};
    const samples=[];
    const seen=new Map(rules.uniqueColumns.map(column=>[column,new Set()]));
    const addIssue=(rowNumber,column,rule,value,message)=>{
      issueCounts[rule]++;
      if(samples.length<100)samples.push({rowNumber,column,rule,value:String(value??'').slice(0,160),message});
    };
    const isValidDate=value=>/^\\d{4}-\\d{2}-\\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
    const validType=(value,type)=>{
      if(type==='TEXT')return true;
      if(type==='NUMBER')return value.trim()!==''&&Number.isFinite(Number(value));
      if(type==='DATE')return isValidDate(value.trim());
      if(type==='BOOLEAN')return ['true','false','1','0','yes','no'].includes(value.trim().toLowerCase());
      return true;
    };
    records.forEach((record,index)=>{
      const rowNumber=index+2;
      for(const column of rules.required){
        if(String(record[column]??'').trim()==='')addIssue(rowNumber,column,'REQUIRED',record[column],'Required value is missing.');
      }
      for(const [column,type] of Object.entries(rules.types)){
        const value=String(record[column]??'');
        if(value.trim()!==''&&!validType(value,type))addIssue(rowNumber,column,'TYPE',value,'Expected '+type.toLowerCase()+' value.');
      }
      for(const [column,allowed] of Object.entries(rules.allowedValues)){
        const value=String(record[column]??'').trim();
        if(value!==''&&allowed.length&&!allowed.includes(value))addIssue(rowNumber,column,'ALLOWED_VALUE',value,'Value is not in the approved list.');
      }
      for(const [column,range] of Object.entries(rules.numericRanges)){
        const raw=String(record[column]??'').trim();
        if(raw==='')continue;
        const value=Number(raw);
        if(!Number.isFinite(value))continue;
        if((range.min!==undefined&&value<range.min)||(range.max!==undefined&&value>range.max))addIssue(rowNumber,column,'MIN_MAX',raw,'Value is outside the configured numeric range.');
      }
      for(const column of rules.uniqueColumns){
        const value=String(record[column]??'').trim();
        if(!value)continue;
        const values=seen.get(column);
        if(values.has(value))addIssue(rowNumber,column,'UNIQUE',value,'Duplicate value in a column marked unique.');
        else values.add(value);
      }
    });
    const issueCount=Object.values(issueCounts).reduce((sum,count)=>sum+count,0);
    const result={versionNumber:Number(versions[0].versionNumber),rowCount:records.length,checkedColumns:configured.length,issueCount,passed:issueCount===0,issueCounts,sampleLimit:100,samples};
    await pool.execute('INSERT INTO dataset_validation_runs (id,dataset_id,version_number,executed_by,rules_json,result_json,status,issue_count) VALUES (?,?,?,?,?,?,?,?)',
      [randomUUID(),req.params.datasetId,result.versionNumber,req.user.id,JSON.stringify(rules),JSON.stringify(result),result.passed?'PASSED':'FAILED',issueCount]);
    await audit({orgId:datasets[0].organization_id,actorId:req.user.id,action:'DATASET_VALIDATED',targetType:'DATASET',targetId:req.params.datasetId,metadata:{versionNumber:result.versionNumber,issueCount,passed:result.passed},ip:req.ip});
    res.status(201).json({result});
  }catch(e){
    if(e?.code?.startsWith('CSV_'))return res.status(400).json({error:'The selected CSV version is invalid and cannot be validated.'});
    next(e);
  }
});

router.get('/datasets/:datasetId/validation-runs',async(req,res,next)=>{
  try{
    const [datasets]=await pool.execute('SELECT organization_id FROM datasets WHERE id=? LIMIT 1',[req.params.datasetId]);
    if(!datasets.length)return res.status(404).json({error:'Dataset not found.'});
    const [members]=await pool.execute("SELECT id FROM memberships WHERE organization_id=? AND user_id=? AND membership_status='ACTIVE' LIMIT 1",[datasets[0].organization_id,req.user.id]);
    if(!members.length)return res.status(403).json({error:'Insufficient organization permissions.'});
    const [runs]=await pool.execute('SELECT r.id,r.version_number AS versionNumber,r.status,r.issue_count AS issueCount,r.created_at AS createdAt,u.full_name AS executedBy FROM dataset_validation_runs r JOIN users u ON u.id=r.executed_by WHERE r.dataset_id=? ORDER BY r.created_at DESC LIMIT 20',[req.params.datasetId]);
    res.json({runs});
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
