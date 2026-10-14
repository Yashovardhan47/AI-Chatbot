import { useEffect, useRef, useState } from "react";
import useAuthStore from "../context/authStore";
import {authAPI} from "../services/api";
import toast from "react-hot-toast";

let scriptPromise;
export function loadGoogleIdentity(){
  if(window.google?.accounts?.id)return Promise.resolve();
  if(scriptPromise)return scriptPromise;
  scriptPromise=new Promise((resolve,reject)=>{
    let script=document.querySelector('script[data-neurosense-google]');
    if(!script){script=document.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;script.defer=true;script.dataset.neurosenseGoogle='true';document.head.appendChild(script);}
    script.addEventListener('load',()=>window.google?.accounts?.id?resolve():reject(new Error('Google identity did not load')),{once:true});
    script.addEventListener('error',()=>reject(new Error('Google sign-in could not load')),{once:true});
  }).catch(error=>{scriptPromise=undefined;document.querySelector('script[data-neurosense-google]')?.remove();throw error;});
  return scriptPromise;
}
export default function GoogleButton({onSuccess}){
  const ref=useRef(null);const googleLogin=useAuthStore(s=>s.googleLogin);
  const [status,setStatus]=useState('loading'),[retry,setRetry]=useState(0);
  useEffect(()=>{let active=true;setStatus('loading');async function setup(){try{
    const {data}=await authAPI.config();if(!active)return;
    if(data?.password_login!==true||typeof data.google_enabled!=='boolean')throw new Error('Invalid authentication configuration');
    if(!data.google_enabled||!data.google_client_id){setStatus('unconfigured');return;}
    await loadGoogleIdentity();if(!active||!ref.current)return;
    window.google.accounts.id.initialize({client_id:data.google_client_id,callback:async response=>{
      if(!active)return;try{await googleLogin(response.credential);toast.success('Signed in with Google');onSuccess?.();}
      catch(err){toast.error(err.response?.data?.detail||'Google sign-in failed');}
    }});
    window.google.accounts.id.renderButton(ref.current,{theme:'outline',size:'large',width:360,shape:'rectangular',text:'continue_with'});setStatus('ready');
  }catch{if(active)setStatus('unavailable');}}setup();return()=>{active=false;};},[retry]);
  return <div className="ns-google-area"><div ref={ref} className="ns-google-button"/>{status==='loading'&&<p>Checking Google sign-in…</p>}{status==='unconfigured'&&<p>Google sign-in is not enabled for this server.</p>}{status==='unavailable'&&<p>Sign-in service unavailable. <button type="button" onClick={()=>setRetry(v=>v+1)}>Retry</button></p>}</div>;
}
