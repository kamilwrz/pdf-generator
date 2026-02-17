import {CircleLoader} from "react-spinners";

export default function Spinner({loading = true}){
    if(!loading) return null;
   return <CircleLoader loading={true}/>
}