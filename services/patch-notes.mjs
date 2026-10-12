import fs from 'node:fs/promises';
import path from 'node:path';
import {validPatchNotes} from '../src/core/patch-notes.mjs';
export async function loadPatchNotes(root,data){
 try{const notes=JSON.parse(await fs.readFile(path.join(root,'patch-notes.json'),'utf8'));if(validPatchNotes(notes,data))return notes;}catch{}
 return {schema:1,scope:'summoners-rift',patches:[],unavailable:true};
}
