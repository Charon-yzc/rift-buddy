import {escape as e} from './ui.mjs';

export function pickEligibilityView(state){
 return `<p class="callout pick-eligibility ${['checked','manual'].includes(state.status)?'':'warning'}" role="status" data-eligibility="${e(state.status)}">${e(state.message)}</p>`;
}
