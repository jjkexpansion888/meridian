import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

export async function atomicJson(path,value) {
  const temporary=`${path}.${randomUUID()}.tmp`;
  await writeFile(temporary,JSON.stringify(value),{mode:0o600});
  await rename(temporary,path);
}
async function dpapi(input,mode) {
  const method=mode==='protect'?'Protect':'Unprotect';
  const command=`Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[Security.Cryptography.ProtectedData]::${method}($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  return await new Promise((resolve,reject)=>{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,stdio:['pipe','pipe','ignore']});
    let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('Windows credential protection timed out.'));},15000);
    child.stdout.on('data',data=>output+=data.toString());
    child.on('error',()=>{clearTimeout(timer);reject(new Error('Windows credential protection is unavailable.'));});
    child.on('close',code=>{clearTimeout(timer);if(code===0)resolve(Buffer.from(output.trim(),'base64'));else reject(new Error('Windows could not protect this ChatGPT connection.'));});
    child.stdin.on('error',()=>{});child.stdin.end(Buffer.from(input).toString('base64'));
  });
}
export async function localStore(root) {
  await mkdir(root,{recursive:true,mode:0o700});
  const settingsPath=join(root,'settings.json'),credentialsPath=join(root,'credentials.json');
  let settings;
  try {settings=JSON.parse(await readFile(settingsPath,'utf8'));} catch(e) {if(e.code!=='ENOENT') throw e;settings={hostId:`urn:uuid:${randomUUID()}`,active:null,profiles:[]};await atomicJson(settingsPath,settings);}
  async function readCredentials() {
    try {const record=JSON.parse(await readFile(credentialsPath,'utf8'));return JSON.parse(record.format==='windows-dpapi'?(await dpapi(Buffer.from(record.data,'base64'),'unprotect')).toString('utf8'):record.data);}
    catch(e) {if(e.code==='ENOENT') return {};throw new Error('Saved credentials could not be opened. Reconnect ChatGPT.');}
  }
  const credentials=await readCredentials();
  let sessionOnly=false;
  let queue=Promise.resolve();
  async function save() {
    const snapshot=JSON.stringify(credentials), config=structuredClone(settings);
    queue=queue.catch(()=>{}).then(async()=>{
      let record;
      if(process.platform==='win32') {
        try {record={format:'windows-dpapi',data:(await dpapi(Buffer.from(snapshot),'protect')).toString('base64')};}
        catch {sessionOnly=true;}
      } else record={format:'owner-only',data:snapshot};
      // Restricted Windows execution may have no user profile for DPAPI. Never
      // downgrade to plaintext credentials: keep this connection in RAM only.
      if(record) {await atomicJson(credentialsPath,record);sessionOnly=false;}
      else await atomicJson(credentialsPath,{format:'owner-only',data:'{}'});
      await atomicJson(settingsPath,config);
    });return queue;
  }
  return {settings,credentials,save,get sessionOnly(){return sessionOnly;},
    async history(account,reportId) {
      try {return JSON.parse(await readFile(join(root,`chat-${account}-${reportId}.json`),'utf8'));}
      catch(e) {if(e.code==='ENOENT') return [];throw e;}
    },
    async saveHistory(account,reportId,messages) {await atomicJson(join(root,`chat-${account}-${reportId}.json`),messages);}
  };
}
