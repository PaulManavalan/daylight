export type ChatActionTarget='draft'|'progress'|'replan';
export function wantsOpenChat(text:string){return /\b(?:just|only|wanna|want to|rather|can we|let['’]s)\b.{0,32}\b(?:talk|chat)\b|\b(?:stop|pause|cancel)\b.{0,24}\b(?:setup|intake|questions|planning)\b/i.test(text);}
/** Only explicit, standalone confirmations can approve a visible proposal. */
export function chatDecision(text:string,pending:ChatActionTarget[],latest:ChatActionTarget|null):{action:'approve'|'decline';target:ChatActionTarget}|null{
 const value=text.trim().toLowerCase().replace(/[.!]+$/,'').trim();
 const affirmation=/^(?:yes|yeah|yep|sure|okay|ok|perfect|great)(?:[, ]+(?:please|do (?:it|that)|go ahead|sounds good|that works(?: for me)?|save it))?$|^(?:go ahead(?: and save it)?|do it|do that|sounds good(?:[, ]+go ahead)?|looks (?:good|right)|that works(?: for me)?)$/;
 const rejection=/^(?:no|no thanks|not now|never mind|nevermind|cancel(?: (?:it|that|this|the proposal))?|don['’]t (?:save|apply|do) (?:it|that))$/;
 if(latest && pending.includes(latest) && (affirmation.test(value)||rejection.test(value)))return {action:rejection.test(value)?'decline':'approve',target:latest};
 const explicit=/^(?:(?:yes|yeah|okay|ok)[, ]+)?(?:please )?(?:save|apply|build|schedule|add) (?:it|that|this|(?:(?:that|this|the|my) )?(?:plan|day|tasks?|changes|proposal))(?: please)?$/;
 const planTargets=pending.filter(p=>p!=='progress');
 if(/^(?:cancel|discard|drop) (?:the |that |this )?(?:plan|proposal|draft|changes)$/.test(value) && planTargets.length===1)return {action:'decline',target:planTargets[0]};
 if(explicit.test(value) && planTargets.length===1)return {action:'approve',target:planTargets[0]};
 return null;
}
