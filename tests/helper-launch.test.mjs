import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {windowsArgument,launchCommand} from '../services/helper-launch.mjs';
const exec=promisify(execFile);
test('development PowerShell launch preserves Unicode and apostrophes without changing system policy',()=>{
 const encoded=launchCommand('C:\\工具\\node.exe',['C:\\朋友的 游戏\\entry.mjs',"C:\\it's ours\\",'quote"here'],'C:\\工具\\launch.json');
 const script=Buffer.from(encoded.at(-1),'base64').toString('utf16le');
 assert.ok(script.includes("'C:\\工具\\node.exe'"));assert.ok(script.includes("it''s ours"));
 assert.ok(script.includes('-Verb RunAs -WindowStyle Hidden -PassThru'));
 assert.ok(!/ExecutionPolicy|Bypass|Set-MpPreference/i.test(script));
 assert.equal(windowsArgument('ends\\'),'"ends\\\\"');
});
test('native launcher quotes real Windows arguments including Unicode, spaces, empty values and trailing slashes', {skip:process.platform!=='win32',timeout:15000},async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rift-buddy-quote-')),harness=path.join(root,'QuoteProbe.cs'),exe=path.join(root,'quote.exe');
 await fs.writeFile(harness,`using System; using System.Text; using System.Diagnostics;
 internal class QuoteProbe { public static int Main(string[] args) {
 var text=ConnectionLauncher.Quote("-e")+" "+ConnectionLauncher.Quote("console.log(JSON.stringify(process.argv.slice(1)))")+" "+ConnectionLauncher.Quote("--");
 for(int i=1;i<args.Length;i++)text+=" "+ConnectionLauncher.Quote(args[i]);
 var info=new ProcessStartInfo(args[0]) { Arguments=text,UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,StandardOutputEncoding=Encoding.UTF8 };
 using(var child=Process.Start(info)){Console.OutputEncoding=new UTF8Encoding(false);Console.Write(child.StandardOutput.ReadToEnd());child.WaitForExit();return child.ExitCode;}
 } }`);
 const compiler=path.join(process.env.SystemRoot,'Microsoft.NET/Framework64/v4.0.30319/csc.exe');
 await exec(compiler,['/nologo','/target:exe','/main:QuoteProbe',`/out:${exe}`,path.resolve('electron/connection-launcher.cs'),harness],{windowsHide:true});
 const args=['','C:\\朋友的 游戏\\开黑搭子\\',"C:\\it's ours\\entry.mjs",'a\\\\"b','plain'];
 const {stdout}=await exec(exe,[process.execPath,...args],{windowsHide:true});assert.deepEqual(JSON.parse(stdout.replace(/^\uFEFF/,'')),args);
});
