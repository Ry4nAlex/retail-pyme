
export function summarizeCases(cases) {
  const evaluated = cases.filter(
    item => typeof item.passed === 'boolean'
  );

  const passed = evaluated.filter(
    item => item.passed === true
  ).length;

  return {
    total_cases: cases.length,
    evaluated_cases: evaluated.length,
    not_evaluated: cases.length - evaluated.length,
    passed,
    failed: evaluated.length - passed,
    compliance_pct: evaluated.length
      ? Math.round(passed / evaluated.length * 10000) / 100
      : null,
  };
}

export function withCases(result, cases) {
  return {
    ...result,
    cases,
    summary: summarizeCases(cases),
    by_agent: Object.fromEntries(
      ['inventario', 'seguimiento'].map(agent => [
        agent,
        summarizeCases(
          cases.filter(item => item.agent === agent)
        ),
      ])
    ),
  };
}

export function mergeCase(result, caseResult) {
  if (
    !caseResult ||
    !result.cases.some(item => item.id === caseResult.id)
  ) {
    throw new Error(
      'La respuesta de evaluación no corresponde al caso solicitado.'
    );
  }

  return withCases(
    result,
    result.cases.map(item =>
      item.id === caseResult.id ? caseResult : item
    )
  );
}
