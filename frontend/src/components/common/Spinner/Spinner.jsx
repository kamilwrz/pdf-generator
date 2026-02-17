import {CircleLoader} from "react-spinners";

export default function Spinner({loading = true}){
    if(!loading) return null;
   return <CircleLoader loading={true} size={150} color="#60a5fa" cssOverride={{position: "absolute", left:"50%", top: "50%", transform: "translate(-50% , -50%)"}}/>
}