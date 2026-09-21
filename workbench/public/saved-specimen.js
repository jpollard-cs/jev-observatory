/** Resolve only a matching immutable request through the authenticated host port. */
export async function savedSpecimen(report,row,read){
 const id=report.design?.hostedRunId,index=row.requestIndex;
 if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id)||!Number.isSafeInteger(index)||index<0||index>=480)return null;
 const found=await read(id,index);
 if(!found||found.planHash!==report.planHash||found.requestHash!==row.plannedRequestHash)return {available:false,reason:'The saved request does not match this report. No input was substituted.'};
 return {available:true,source:'Your saved hosted request',scope:'Exact stored input; run plan and request hashes match this observation.',material:found.request.state?.material??found.request.state,context:found.request.state?.trustedContext??null,request:found.request,sourceFixtureHash:found.requestHash};
}
