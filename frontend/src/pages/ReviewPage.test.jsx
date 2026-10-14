import React from 'react';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {render,screen,waitFor,cleanup} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router-dom';
const mocks=vi.hoisted(()=>({review:vi.fn(),resolve:vi.fn(),prefs:vi.fn(),update:vi.fn()}));
vi.mock('../services/api',()=>({workspaceAPI:{review:mocks.review,resolve:mocks.resolve},userAPI:{updatePrefs:mocks.prefs}}));
vi.mock('../context/authStore',()=>({default:()=>({user:{preferences:{memory_review_required:true}},updateUser:mocks.update})}));
import ReviewPage from './ReviewPage';
beforeEach(()=>{vi.clearAllMocks();mocks.review.mockResolvedValue({data:{total:1,proposals:[{id:'p1',chat_id:'c1',candidate:{fact:'I use Python',quote:'I use Python',category:'skill'},status:'pending'}]}});mocks.resolve.mockResolvedValue({});});
afterEach(cleanup);
it('approves the exact proposal ID and links to its original conversation',async()=>{
 render(<MemoryRouter><ReviewPage/></MemoryRouter>);expect((await screen.findByRole('link',{name:/Original conversation/})).getAttribute('href')).toBe('/chat/c1');
 await userEvent.click(screen.getByRole('button',{name:'Approve proposal'}));await waitFor(()=>expect(mocks.resolve).toHaveBeenCalledWith('p1','approve'));
});
it('rejects a proposal without sending a new memory payload',async()=>{
 render(<MemoryRouter><ReviewPage/></MemoryRouter>);await userEvent.click(await screen.findByRole('button',{name:'Reject proposal'}));
 await waitFor(()=>expect(mocks.resolve).toHaveBeenCalledWith('p1','reject'));
});
