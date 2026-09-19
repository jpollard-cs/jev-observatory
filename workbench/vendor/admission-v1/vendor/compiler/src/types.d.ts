/** Data contracts only. JSON schemas provide the full persisted shape. */
export type Json = null | boolean | number | string | Json[] | {[key:string]:Json};
export type Description = null | string | Json[] | {[key:string]:Json};
export interface Judgment {
 id:string; kind:'categorical'|'boolean-proposition'|'ordinal-rubric';
 instructions:Description; criteria:{key:string;description:Description}[];
 hasCriteria:boolean; dependsOn:string[]; requiredGuideBlocks:string[];
 originalFieldOrder:('type'|'instructions'|'criteria')[];
}
export interface GuideBlock {
 id:string; heading:string; content:Json; contentHash:string;
 source:{pointer:string;startUtf16?:number;endUtf16?:number;startLine?:number;endLine?:number}; sourceKey?:string;
}
export interface Demonstration {
 id:string;family:string|null;sourcePointer:string;content:{[key:string]:Json};contentHash:string;
 labels:Record<string,{value:string|number|boolean;origin:string}>;originalProfile:{[key:string]:Json};
}
export interface PolicyPack {
 guidance:{format:'markdown'|'ordered-object';sourceHash:string;blocks:GuideBlock[]};
 judgments:Judgment[];
 demonstrations:{sourceHash:string|null;corpus:{[key:string]:Json}|null;examples:Demonstration[]};
}
export interface EvaluationDocument {
 schemaVersion:'policy-payload/1';policyPack:PolicyPack;
 caseInput:{configuration:{[key:string]:Json};trustedContext:{[key:string]:Json};material:Json};
 compatibility:{model:string;topLevelOrder:string[];stateOrder:string[]};
 provenance:{importer:string;sourceRequestHash:string};
}
export interface RenderProfile {
 schemaVersion:'payload-profile/1';id:string;renderer:'jev'|'chat-envelope';
 examplePlacement:'legacy-state'|'question-local'|'criterion-local';
 guidePlacement:'legacy-state'|'structured-state'|'question-local';
 questionGrouping:'together'|'one-per-request';
 exampleContextLayout?:'inline'|'factored-per-question';
 omitGuideBlocks?:Record<string,string>;questionGuideOmissions?:Record<string,Record<string,string>>;maxRequestBytes:number;notes?:string;
}
export interface RenderedRequest {
 questionIds:string[];payload:Json;body:string;wireHash:string;wireBytes:number;
 inputTokens:null;tokenCountStatus:'unmeasured';
}
