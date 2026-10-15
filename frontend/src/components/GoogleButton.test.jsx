import React from "react";
import {beforeEach,afterEach,expect,it,vi} from "vitest";
import {render,screen,waitFor,cleanup,act} from "@testing-library/react";
const mocks=vi.hoisted(()=>({config:vi.fn(),login:vi.fn()}));
vi.mock('../services/api',()=>({authAPI:{config:mocks.config}}));
vi.mock('../context/authStore',()=>({default:selector=>selector({googleLogin:mocks.login})}));
import GoogleButton from './GoogleButton';
import {MemoryRouter} from "react-router-dom";
beforeEach(()=>{vi.clearAllMocks();});afterEach(()=>{cleanup();delete window.google;});
it('renders the official provider button using the server public client ID',async()=>{
 const initialize=vi.fn(),renderButton=vi.fn();window.google={accounts:{id:{initialize,renderButton}}};
 mocks.config.mockResolvedValue({data:{google_enabled:true,google_client_id:'verified-client',password_login:true}});mocks.login.mockResolvedValue({});const success=vi.fn();
 render(<MemoryRouter><GoogleButton onSuccess={success}/></MemoryRouter>);await waitFor(()=>expect(renderButton).toHaveBeenCalled());
 expect(initialize.mock.calls[0][0].client_id).toBe('verified-client');await act(async()=>{await initialize.mock.calls[0][0].callback({credential:'google-id-token'});});
 expect(mocks.login).toHaveBeenCalledWith('google-id-token');expect(success).toHaveBeenCalled();
});
it('shows a real missing-configuration state without a fake Google login',async()=>{
 mocks.config.mockResolvedValue({data:{google_enabled:false,google_client_id:null,password_login:true}});
 render(<MemoryRouter><GoogleButton/></MemoryRouter>);await screen.findByText('Google sign-in is not activated for this installation.');expect(mocks.login).not.toHaveBeenCalled();
});
it('reports an unreachable or non-API server instead of pretending sign-in is ready',async()=>{
 mocks.config.mockResolvedValue({data:'<html>not an API</html>'});render(<MemoryRouter><GoogleButton/></MemoryRouter>);
 await screen.findByText(/The sign-in service could not be reached/);expect(mocks.login).not.toHaveBeenCalled();
});

it('keeps the Google option visible and disabled while configuration is missing',async()=>{
 mocks.config.mockResolvedValue({data:{google_enabled:false,google_client_id:null,password_login:true}});
 render(<MemoryRouter><GoogleButton/></MemoryRouter>);await screen.findByText(/not activated/);
 expect(screen.getByRole('button',{name:'Continue with Google'}).disabled).toBe(true);
 expect(screen.getByRole('link',{name:/View Google sign-in setup/}).getAttribute('href')).toBe('/auth-setup');
});
it('shows an inline Google rejection without calling the success handler',async()=>{
 const initialize=vi.fn();window.google={accounts:{id:{initialize,renderButton:vi.fn()}}};
 mocks.config.mockResolvedValue({data:{google_enabled:true,google_client_id:'client',password_login:true}});
 mocks.login.mockRejectedValue({response:{data:{detail:'Sign in with your existing method, then link Google in Account security.'}}});const success=vi.fn();
 render(<MemoryRouter><GoogleButton onSuccess={success}/></MemoryRouter>);await waitFor(()=>expect(initialize).toHaveBeenCalled());
 await act(async()=>{await initialize.mock.calls[0][0].callback({credential:'credential'});});
 expect(screen.getByRole('alert').textContent).toContain('existing method');expect(success).not.toHaveBeenCalled();
});
it('rejects an empty Google callback before submitting a credential',async()=>{
 const initialize=vi.fn();window.google={accounts:{id:{initialize,renderButton:vi.fn()}}};
 mocks.config.mockResolvedValue({data:{google_enabled:true,google_client_id:'client',password_login:true}});
 render(<MemoryRouter><GoogleButton/></MemoryRouter>);await waitFor(()=>expect(initialize).toHaveBeenCalled());
 await act(async()=>{await initialize.mock.calls[0][0].callback({});});
 expect(screen.getByRole('alert').textContent).toContain('did not return');expect(mocks.login).not.toHaveBeenCalled();
});
