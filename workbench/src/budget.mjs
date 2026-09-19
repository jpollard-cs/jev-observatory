import {assert} from './util.mjs';
// Bounds are numeric-accounting limits, not product/spending authorization.
export const MAX_PLANNING_TOKENS=Math.floor(Number.MAX_SAFE_INTEGER/42);
export function validateBudget(value,label='Test budget'){
 assert(typeof value==='number'&&Number.isFinite(value)&&value>0&&Number.isSafeInteger(Math.floor(value*1e9))&&Math.floor(value*1e9)>0,`${label} must be a positive number that can be represented safely in the local cost ledger`);
 return value;
}
export function validateTokenLimit(value){
 if(value===null)return MAX_PLANNING_TOKENS;
 assert(Number.isSafeInteger(value)&&value>0&&value<=MAX_PLANNING_TOKENS,'Input-token planning limit must be a positive safe whole number, or disabled');return value;
}
export function coverageBudget({requestedUsd,selectedUsd,completeUsd,selectedTokens,completeTokens,tokenLimit}){
 return {requestedUsd,selectedReservationUsd:selectedUsd,completeCatalogReservationUsd:completeUsd,
  unusedUsd:Math.max(0,requestedUsd-selectedUsd),completeCatalogInBudget:completeUsd<=requestedUsd&&completeTokens<=tokenLimit,
  completeCatalogPlanningTokens:completeTokens,selectedPlanningTokens:selectedTokens,
  meaning:'Catalog reservation estimate only; paid execution still requires a separately approved plan and the account ledger. A larger budget never creates extra test repetitions.'};
}
