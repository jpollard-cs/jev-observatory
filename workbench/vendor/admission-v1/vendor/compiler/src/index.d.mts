import type {Json,EvaluationDocument,RenderProfile,RenderedRequest,Judgment,PolicyPack} from './types.js';
export type * from './types.js';
export declare const VERSION:'policy-payload/1';
export declare class CompileError extends Error {code:string;details:Record<string,unknown>}
export declare function jsonHash(value:unknown):string;
export declare function sha256(value:string|Uint8Array):string;
export declare function importJevRequest(request:unknown):EvaluationDocument;
export declare function validateDocument(document:EvaluationDocument):void;
export declare function assessmentHash(document:EvaluationDocument):string;
export declare function renderLegacy(document:EvaluationDocument):Json;
export declare function decomposeGuidance(value:Json):PolicyPack['guidance'];
export declare function assembleGuidance(guide:PolicyPack['guidance'],blocks?:PolicyPack['guidance']['blocks']):Json;
export declare function importDemonstrations(value:Record<string,Json>|null):PolicyPack['demonstrations'];
export declare function examplesForQuestion(bank:PolicyPack['demonstrations'],question:Judgment):{assigned:unknown[];unassigned:unknown[]};
export declare function validateProfile(profile:RenderProfile):void;
export declare function render(document:EvaluationDocument,profile:RenderProfile,options?:{allowPolicyOmissions?:boolean;model?:string}):{requests:RenderedRequest[];receipt:Record<string,any>};
export declare function exampleAssignmentSignature(result:ReturnType<typeof render>):string;
export declare function normalizeJevResponse(response:unknown,judgments:Judgment[]):{origin:'native_jev';model:string|null;raw:unknown;answers:Record<string,any>};
export declare function normalizeGenerativeAnswer(text:string,judgments:Judgment[]):{origin:'generated_json';model:null;raw:unknown;answers:Record<string,any>};
export declare function compileInferenceJobs(request:unknown,profile:RenderProfile,options?:{allowPolicyOmissions?:boolean;model?:string}):{
 document:EvaluationDocument;receipt:Record<string,any>;jobs:{artifactId:string;transport:'typesafe-systemone'|'generic-message-plan';body:string;payload:Json;requestHash:string;requestBytes:number;questionIds:string[];provenance:Record<string,string>}[];
};
export declare function loadWorkspace(options:{project:string;packageRoot:string;condition?:string;suite?:'regression'|'boundary'}):Promise<{definition:unknown;sourceBindings:Record<string,string>;rows:{request:unknown;evaluationOnly:unknown}[]}>;
