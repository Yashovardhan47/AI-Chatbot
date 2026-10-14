import {createContext,useContext} from "react";
export const FrameContext=createContext(null);
export const useAppFrame=()=>useContext(FrameContext);
