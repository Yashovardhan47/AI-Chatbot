import React from "react";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {render,screen,waitFor,cleanup} from "@testing-library/react";
const mocks=vi.hoisted(()=>({config:vi.fn(),login:vi.fn()}));
vi.mock('../services/api',()=>({authAPI:{config:mocks.config}}));
vi.mock('../context/authStore',()=>({default:selector=>selector({googleLogin:mocks.login})}));
import GoogleButton from './GoogleButton';
beforeEach(()=>{vi.clearAllMocks();});afterEach(()=>{cleanup();delete window.google;});
it('renders the official provider button using the server public client ID',async()=>{
 const initialize=vi.fn(),renderButton=vi.fn();window.google={accounts:{id:{initialize,renderButton}}};
 mocks.config.mockResolvedValue({data:{google_enabled:true,google_client_id:'verified-client',password_login:true}});mocks.login.mockResolvedValue({});const success=vi.fn();
 render(<GoogleButton onSuccess={success}/>);await waitFor(()=>expect(renderButton).toHaveBeenCalled());
 expect(initialize.mock.calls[0][0].client_id).toBe('verified-client');await initialize.mock.calls[0][0].callback({credential:'google-id-token'});
 expect(mocks.login).toHaveBeenCalledWith('google-id-token');expect(success).toHaveBeenCalled();
});
it('shows a real missing-configuration state without a fake Google login',async()=>{
 mocks.config.mockResolvedValue({data:{google_enabled:false,google_client_id:null,password_login:true}});
 render(<GoogleButton/>);await screen.findByText('Google sign-in is not enabled for this server.');expect(mocks.login).not.toHaveBeenCalled();
});
it('reports an unreachable or non-API server instead of pretending sign-in is ready',async()=>{
 mocks.config.mockResolvedValue({data:'<html>not an API</html>'});render(<GoogleButton/>);
 await screen.findByText(/Sign-in service unavailable/);expect(mocks.login).not.toHaveBeenCalled();
});
