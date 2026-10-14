import {afterEach,expect,it} from 'vitest';
import {validateApiBase} from './runtime';
afterEach(()=>localStorage.clear());
it('accepts an HTTPS API or local development URL',()=>{expect(validateApiBase('https://api.example.com/api/')).toBe('https://api.example.com/api');expect(validateApiBase('http://localhost:8000/api')).toBe('http://localhost:8000/api');});
it('rejects embedded credentials and insecure remote API addresses',()=>{for(const url of ['http://remote.example/api','https://user:password@example.com/api','https://example.com/api?key=secret'])expect(()=>validateApiBase(url)).toThrow();});
