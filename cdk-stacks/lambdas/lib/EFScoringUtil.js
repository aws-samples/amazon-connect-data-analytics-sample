const {QuestionTypes} = require('../constants/EvaluationFormsConstants');

const extractEvaluationFormDetails = (evaluationFormObject) => {
  const evaluationId = evaluationFormObject.evaluationId;
  const contactId = evaluationFormObject.metadata?.contactId;
  const instanceId = evaluationFormObject.metadata?.instanceId;
  const agentId = evaluationFormObject.metadata?.agentId;
  const evaluationDefinitionTitle = evaluationFormObject.metadata?.evaluationDefinitionTitle;
  const evaluator = evaluationFormObject.metadata?.evaluator;

  const evaluationStartTimestamp = evaluationFormObject.metadata?.evaluationStartTimestamp;
  const evaluationSubmitTimestamp = evaluationFormObject.metadata?.evaluationSubmitTimestamp;

  const evaluationQuestionAnswers = extractEvaluationQuestionsAnswers(evaluationFormObject.sections, evaluationFormObject.questions);
  const evaluationSectionsScores = extractEvaluationSectionScores(evaluationFormObject.sections);
  const evaluationFormTotalScorePercentage = parseFloat(evaluationFormObject.metadata?.score?.percentage) || null;

  return {
    evaluationId,
    contactId,
    instanceId,
    agentId,
    evaluationDefinitionTitle,
    evaluator,
    evaluationStartTimestamp,
    evaluationSubmitTimestamp,
    evaluationQuestionAnswers,
    evaluationSectionsScores,
    evaluationFormTotalScorePercentage,
  }
}

const extractEvaluationQuestionsAnswers = (evaluationFormSections = [], evaluationFormQuestions = []) => {

  let questionsAnswers = [];


  for (const questionObject of evaluationFormQuestions) {

    const sectionObject = getSectionByRefId(evaluationFormSections, questionObject.sectionRefId);
    const parentSectionObject = getParentSectionByRefId(evaluationFormSections, questionObject.sectionRefId);

    const questionRefId = questionObject.questionRefId;

    const sectionRefId = questionObject.sectionRefId;
    const sectionTitle = sectionObject.sectionTitle;

    const parentSectionRefId = parentSectionObject?.sectionRefId ?? null;
    const parentSectionTitle = parentSectionObject?.sectionTitle ?? null;

    const fullSectionTitle = getFullSectionTitle(sectionTitle, parentSectionTitle);

    const questionType = questionObject.questionType;
    const questionText = questionObject.questionText;

    const questionAnswer = getQuestionAnswer(questionObject);

    questionsAnswers.push({
      questionRefId,
      sectionRefId,
      sectionTitle,
      parentSectionRefId,
      parentSectionTitle,
      fullSectionTitle,
      questionType,
      questionText,
      ...questionAnswer,
    });

  }

  return questionsAnswers;
}

const extractEvaluationSectionScores = (evaluationFormSections = []) => {
  let sectionsScores = [];
  for (const sectionObject of evaluationFormSections) {
    const sectionRefId = sectionObject.sectionRefId;
    const sectionTitle = sectionObject.sectionTitle;
    const sectionScorePercentage = parseFloat(sectionObject.score.percentage) || null;
    sectionsScores.push({
      sectionRefId,
      sectionTitle,
      sectionScorePercentage,
    });
  }

  return sectionsScores;
}

const getSectionByRefId = (evaluationFormSections, sectionRefId) => {
  const sectionObject = evaluationFormSections.find(evaluationFormSection => evaluationFormSection.sectionRefId === sectionRefId);
  return sectionObject;
}

const getParentSectionByRefId = (evaluationFormSections, sectionRefId) => {
  const sectionObject = getSectionByRefId(evaluationFormSections, sectionRefId);
  if (!Object.prototype.hasOwnProperty.call(sectionObject, 'parentSectionRefId')) return null;
  const parentSectionObject = getSectionByRefId(evaluationFormSections, sectionObject.parentSectionRefId);
  return parentSectionObject;
}

const getFullSectionTitle = (sectionTitle, parentSectionTitle) => {
  if (parentSectionTitle) return `${parentSectionTitle} -> ${sectionTitle}`;
  return sectionTitle;
}

const getQuestionAnswer = (questionObject) => {
  switch (questionObject.questionType) {
    case QuestionTypes.TEXT:
      return getQuestionAnswerText(questionObject);
    case QuestionTypes.SINGLESELECT:
      return getQuestionAnswerSingleSelect(questionObject);
    case QuestionTypes.NUMERIC:
      return getQuestionAnswerNumeric(questionObject);
    default:
      console.warn(`EvaluationFormsService -> getQuestionAnswer -> questionType: ${questionObject.questionType} is not supported. Skipping...`)
      return null;
  }
}

const getQuestionAnswerText = (questionObject) => {
  let questionAnswerValue = questionObject?.answer?.value ?? null;
  if (questionAnswerValue === 'undefined') questionAnswerValue = null;

  let questionAnswerScorePercentage = null; //No scoring for (free) TEXT based answers

  return {
    questionAnswerValue,
    questionAnswerScorePercentage,
  }
}

const getQuestionAnswerNumeric = (questionObject) => {
  let questionAnswerValue = questionObject?.answer?.value ?? null;
  if (questionAnswerValue === 'undefined') questionAnswerValue = null;

  let questionAnswerScorePercentage = parseFloat(questionObject?.score?.percentage) || null;

  return {
    questionAnswerValue,
    questionAnswerScorePercentage,
  }
}

const getQuestionAnswerSingleSelect = (questionObject) => {
  const singleSelectSelectedAnswer = getSingleSelectSelectedAnswer(questionObject.answer);

  const questionAnswerValue = singleSelectSelectedAnswer?.valueText ?? null;
  const questionAnswerValueRefId = singleSelectSelectedAnswer?.valueRefId ?? null;

  const questionAnswerScorePercentage = parseFloat(questionObject?.score?.percentage) || null;

  return {
    questionAnswerValue,
    questionAnswerValueRefId,
    questionAnswerScorePercentage,
  }
}

const getSingleSelectSelectedAnswer = (questionObjectAnswer) => {
  const singleSelectSelectedAnswer = questionObjectAnswer?.values?.find(questionObjectAnswerValue => questionObjectAnswerValue.selected);
  if (!singleSelectSelectedAnswer) return null;
  return singleSelectSelectedAnswer;
}

module.exports = {
  extractEvaluationFormDetails,
}
