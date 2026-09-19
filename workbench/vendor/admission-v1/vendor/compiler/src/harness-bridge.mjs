import {importJevRequest} from './ir.mjs';
import {render} from './render.mjs';
import {jsonHash} from './core.mjs';

/**
 * Pure integration boundary. The existing harness remains responsible for locking,
 * durable budget reservations, version checks, rate limits and response persistence.
 * Evaluation labels are deliberately not a parameter to this function.
 */
export function compileInferenceJobs(request,profile,options={}){
  const document=importJevRequest(request);
  const rendered=render(document,profile,options);
  return {
    document,receipt:rendered.receipt,
    jobs:rendered.requests.map((r,index)=>({
      artifactId:jsonHash({assessmentHash:rendered.receipt.assessmentHash,profileHash:rendered.receipt.profileHash,wireHash:r.wireHash,index}),
      transport:profile.renderer==='jev'?'typesafe-systemone':'generic-message-plan',
      body:r.body,payload:r.payload,requestHash:r.wireHash,requestBytes:r.wireBytes,questionIds:r.questionIds,
      provenance:{assessmentHash:rendered.receipt.assessmentHash,profileHash:rendered.receipt.profileHash,sourceRequestHash:document.provenance.sourceRequestHash},
    })),
  };
}
