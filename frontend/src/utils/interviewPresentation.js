import { t as uiText } from "../i18n/index.js";
/** Human-readable names for the normalized profile fields shared by review UI. */
export const interviewFields = { get '/name'() { return uiText("interview:interviewFlow.fullName"); }, get '/title'() { return uiText("interview:interviewFlow.targetRole"); }, '/email': 'E-mail', get '/phone'() { return uiText("editor:contactChannelNames.phone"); }, get '/address'() { return uiText("editor:careerProfileView.location"); }, get '/summary'() { return uiText("interview:cvContent.summary"); }, '/linkedin': 'LinkedIn', '/github': 'GitHub', get '/website'() { return uiText("interview:interviewPresentation.website"); } };

/** Describe evidence without displaying persistence paths to the candidate. */
export function factLabel(fact) {
  if (interviewFields[fact.path]) return interviewFields[fact.path];
  if (fact.path?.startsWith('/experience/')) return uiText("interview:interviewPresentation.workExperience");
  if (fact.path?.startsWith('/education/')) return uiText("interview:cvContent.education");
  if (fact.path?.startsWith('/custom_sections/')) return uiText("interview:interviewPresentation.additionalSectionProject");
  if (fact.path?.startsWith('/skills/')) return uiText("interview:cvContent.skills");
  if (fact.path?.startsWith('/languages/')) return uiText("interview:cvContent.languages");
  return fact.kind === 'gap' ? uiText("interview:factEditor.noExperience") : fact.kind === 'framing' ? uiText("interview:interviewPresentation.approvedWording") : uiText("interview:interviewPresentation.careerInformation");
}
