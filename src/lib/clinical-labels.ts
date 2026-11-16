// Rótulos do prontuário (compartilhados entre formulário e impressão)
export const MR_GROUPS: { title: string; fields: [string, string][] }[] = [
  { title: 'Anamnese clínica', fields: [['chief_complaint', 'Queixa principal'], ['current_history', 'História atual'], ['condition_history', 'Histórico da condição'], ['personal_history', 'Antecedentes pessoais'], ['family_history', 'Antecedentes familiares'], ['surgeries', 'Cirurgias'], ['injuries', 'Lesões'], ['diseases', 'Doenças'], ['medications', 'Medicamentos'], ['allergies', 'Alergias'], ['habits', 'Hábitos'], ['physical_activity', 'Atividade física'], ['goals', 'Objetivos'], ['limitations', 'Limitações'], ['contraindications', 'Contraindicações'], ['pain_description', 'Dor'], ['clinical_notes', 'Observações clínicas']] },
  { title: 'Fisioterapia', fields: [['clinical_history', 'História clínica'], ['physical_exam', 'Exame físico-funcional'], ['complementary_exams', 'Exames complementares'], ['physio_diagnosis', 'Diagnóstico fisioterapêutico'], ['physio_prognosis', 'Prognóstico fisioterapêutico'], ['therapeutic_goals', 'Objetivos terapêuticos'], ['conduct', 'Conduta'], ['treatment_plan', 'Plano de tratamento']] },
];

export const EVOLUTION_FIELDS: [string, string][] = [
  ['complaints', 'Queixas'], ['patient_state', 'Estado do paciente'], ['treatment_response', 'Resposta ao tratamento'],
  ['incidents', 'Intercorrências'], ['guidance', 'Orientações'], ['next_conduct', 'Conduta para a próxima sessão'], ['notes', 'Observações'],
];
