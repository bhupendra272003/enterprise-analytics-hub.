import nodemailer from 'nodemailer';
import {config} from './config.js';
const transporter=config.smtpHost?nodemailer.createTransport({
 host:config.smtpHost,port:config.smtpPort,secure:config.smtpSecure,
 auth:config.smtpUser?{user:config.smtpUser,pass:config.smtpPassword}:undefined
}):null;
export async function sendEmail({to,subject,text,html}){
 if(!transporter)return false;
 await transporter.sendMail({from:config.smtpFrom,to,subject,text,html});
 return true;
}
