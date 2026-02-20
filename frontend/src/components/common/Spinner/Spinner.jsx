import { CircleLoader } from "react-spinners";

export default function Spinner({ loading = true }) {
    if (!loading) return null;
    return  <div style={{position: "absolute", left: "50%", top: "40%", transform: "translate(-50% , -50%)", zIndex: "2000" }}>
        <p style={{width: "160px", textAlign: "center", fontFamily: "Inter", fontSize: "1.2rem", color:"#60a5fa", position: "absolute", top: "75px", left:"50%", transform: "translateX(-50%)"}}>Is loading...</p>
        <CircleLoader loading={true} size={150} color="#60a5fa" />
    </div>
   
}