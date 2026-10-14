import React from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {render,screen,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const mocks=vi.hoisted(()=>({get:vi.fn(),api:{defaults:{baseURL:'https://original.example/api'}}}));
vi.mock('axios',()=>({default:{get:mocks.get}}));
vi.mock('../services/api',()=>({default:mocks.api}));
import ConnectionSettings from './ConnectionSettings';
afterEach(()=>{cleanup();localStorage.clear();vi.clearAllMocks();});
it('checks a candidate API without forwarding the current JWT or changing an active connection',async()=>{
 localStorage.setItem('accessToken','existing-test-jwt');mocks.get.mockResolvedValue({data:'<html>not an API</html>'});
 render(<ConnectionSettings/>);const user=userEvent.setup();await user.click(screen.getByRole('button',{name:'Backend connection'}));
 const input=screen.getByLabelText('API base URL');await user.clear(input);await user.type(input,'https://candidate.example/api');
 await user.click(screen.getByRole('button',{name:'Connect backend'}));await screen.findByRole('alert');
 expect(mocks.get).toHaveBeenCalledWith('https://candidate.example/api/auth/config',{timeout:5000,withCredentials:false});
 expect(mocks.api.defaults.baseURL).toBe('https://original.example/api');expect(localStorage.getItem('accessToken')).toBe('existing-test-jwt');
});
