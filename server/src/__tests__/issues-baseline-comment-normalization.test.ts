import { describe, expect, it } from "vitest";
import { normalizeBaselineTrackingIssueAgentComment } from "../services/issues.js";

describe("normalizeBaselineTrackingIssueAgentComment", () => {
  it("rewrites safe-for-first-CTO Portuguese closeout and appends structured markers", () => {
    const normalized = normalizeBaselineTrackingIssueAgentComment({
      issueId: "issue-1",
      issueIdentifier: "BBC-1",
      workspaceMetadata: {
        repositoryDocumentationBaseline: {
          trackingIssueId: "issue-1",
          trackingIssueIdentifier: "BBC-1",
          updatedAt: "2026-04-27T18:00:00.000Z",
        },
      },
      operatingContext: {
        baselineStatus: "accepted",
        baselineFingerprint: "fp-pt-1",
      },
      body: [
        "A nova reanálise não mudou o veredito.",
        "",
        "O baseline de `BBC-1` continua suficiente para trabalho futuro de agentes.",
        "",
        "A próxima ação única do operador continua sendo adicionar uma freshness note em `BBC-1`. Depois disso, o baseline fica seguro para onboarding do CTO e execução futura.",
      ].join("\n\n"),
    });

    expect(normalized).toContain("Repository context is sufficient for the first CTO hire.");
    expect(normalized).toContain("Accept repository context from Project Intake, then generate the CTO hiring brief.");
    expect(normalized).toContain("<!-- paperclip:baseline-ceo-review-response fingerprint=\"fp-pt-1|repository_context_accepted\" -->");
    expect(normalized).toContain("<!-- paperclip:baseline-ceo-review-decision decision=\"sufficient_for_first_cto\" -->");
    expect(normalized).not.toContain("A próxima ação única do operador continua sendo adicionar uma freshness note");
  });

  it("leaves non-baseline issues unchanged", () => {
    const body = "Mensagem normal sem relação com baseline.";
    const normalized = normalizeBaselineTrackingIssueAgentComment({
      issueId: "issue-2",
      issueIdentifier: "BBC-2",
      workspaceMetadata: {
        repositoryDocumentationBaseline: {
          trackingIssueId: "issue-1",
          trackingIssueIdentifier: "BBC-1",
          updatedAt: "2026-04-27T18:00:00.000Z",
        },
      },
      operatingContext: {
        baselineStatus: "accepted",
        baselineFingerprint: "fp-pt-1",
      },
      body,
    });

    expect(normalized).toBe(body);
  });

  it("uses operatingContext tracking issue fields when workspace metadata is unavailable", () => {
    const normalized = normalizeBaselineTrackingIssueAgentComment({
      issueId: "issue-1",
      issueIdentifier: "BBC-1",
      workspaceMetadata: null,
      operatingContext: {
        baselineStatus: "accepted",
        baselineFingerprint: "fp-context-1",
        baselineTrackingIssueId: "issue-1",
        baselineTrackingIssueIdentifier: "BBC-1",
      },
      body: [
        "O baseline de `BBC-1` continua suficiente para trabalho futuro de agentes.",
        "",
        "A próxima ação única do operador continua sendo adicionar uma freshness note em `BBC-1`.",
      ].join("\n\n"),
    });

    expect(normalized).toContain("Accept repository context from Project Intake, then generate the CTO hiring brief.");
    expect(normalized).toContain("<!-- paperclip:baseline-ceo-review-response fingerprint=\"fp-context-1|repository_context_accepted\" -->");
    expect(normalized).toContain("<!-- paperclip:baseline-ceo-review-decision decision=\"sufficient_for_first_cto\" -->");
  });

  it("classifies equivalent Portuguese onboarding phrasing as sufficient for the first CTO", () => {
    const normalized = normalizeBaselineTrackingIssueAgentComment({
      issueId: "issue-1",
      issueIdentifier: "BBC-1",
      workspaceMetadata: null,
      operatingContext: {
        baselineStatus: "accepted",
        baselineFingerprint: "fp-context-2",
        baselineTrackingIssueId: "issue-1",
        baselineTrackingIssueIdentifier: "BBC-1",
      },
      body: [
        "A tese central permaneceu estavel: o baseline de `BBC-1` e suficiente para onboarding tecnico futuro.",
        "",
        "Se eu condensasse tudo numa versao canonica unica, seria esta: baseline bom o bastante para onboarding; a proxima acao do operador e publicar uma freshness note em `BBC-1`.",
      ].join("\n\n"),
    });

    expect(normalized).toContain("Repository context is sufficient for the first CTO hire.");
    expect(normalized).toContain("Accept repository context from Project Intake, then generate the CTO hiring brief.");
    expect(normalized).toContain("<!-- paperclip:baseline-ceo-review-decision decision=\"sufficient_for_first_cto\" -->");
    expect(normalized).not.toContain("publicar uma freshness note");
  });

  it("removes contradictory Portuguese pre-hire delegation gates from sufficient baseline reviews", () => {
    const normalized = normalizeBaselineTrackingIssueAgentComment({
      issueId: "issue-1",
      issueIdentifier: "BBC-1",
      workspaceMetadata: null,
      operatingContext: {
        baselineStatus: "accepted",
        baselineFingerprint: "fp-context-3",
        baselineTrackingIssueId: "issue-1",
        baselineTrackingIssueIdentifier: "BBC-1",
      },
      body: [
        "Refazendo a análise de forma direta: o baseline de `BBC-1` é suficiente para onboarding técnico futuro, mas ainda não está pronto para delegação sem uma nota operacional explícita do operador.",
        "",
        "O gap principal não é arquitetura nem design; é o contrato operacional.",
      ].join("\n\n"),
    });

    expect(normalized).toContain("Repository context is sufficient for the first CTO hire.");
    expect(normalized).toContain("Accept repository context from Project Intake, then generate the CTO hiring brief.");
    expect(normalized).toContain("<!-- paperclip:baseline-ceo-review-decision decision=\"sufficient_for_first_cto\" -->");
    expect(normalized).not.toContain("não está pronto para delegação");
    expect(normalized).not.toContain("nota operacional explícita");
  });

  it("normalizes latest CEO wording that says future technical work is sufficient but delegation still is not", () => {
    const normalized = normalizeBaselineTrackingIssueAgentComment({
      issueId: "issue-1",
      issueIdentifier: "BBC-1",
      workspaceMetadata: null,
      operatingContext: {
        baselineStatus: "accepted",
        baselineFingerprint: "fp-context-4",
        baselineTrackingIssueId: "issue-1",
        baselineTrackingIssueIdentifier: "BBC-1",
      },
      body: [
        "Novo review, objetivo: o baseline de `BBC-1` é suficiente para futuro trabalho técnico, mas ainda não é contexto bom o bastante para delegação sem uma nota operacional do operador.",
        "",
        "Minha recomendação segue a mesma: baseline suficiente, delegação ainda não. A próxima ação única do operador deve ser adicionar uma freshness note em `BBC-1` definindo package manager/runtime oficial.",
      ].join("\n\n"),
    });

    expect(normalized).toContain("Repository context is sufficient for the first CTO hire.");
    expect(normalized).toContain("Accept repository context from Project Intake, then generate the CTO hiring brief.");
    expect(normalized).toContain("<!-- paperclip:baseline-ceo-review-decision decision=\"sufficient_for_first_cto\" -->");
    expect(normalized).not.toContain("delegação ainda não");
    expect(normalized).not.toContain("não é contexto bom o bastante");
    expect(normalized).not.toContain("freshness note");
  });

  it("normalizes CEO log wording that says technical future work is sufficient but needs more operational context", () => {
    const normalized = normalizeBaselineTrackingIssueAgentComment({
      issueId: "issue-1",
      issueIdentifier: "BBC-1",
      workspaceMetadata: null,
      operatingContext: {
        baselineStatus: "accepted",
        baselineFingerprint: "fp-context-5",
        baselineTrackingIssueId: "issue-1",
        baselineTrackingIssueIdentifier: "BBC-1",
      },
      body: [
        "**Veredito**",
        "",
        "O baseline de `BBC-1` é suficiente para trabalho técnico futuro, mas ainda não está pronto para delegação sem contexto operacional adicional.",
        "",
        "**Próxima ação**",
        "",
        "Adicionar uma freshness note em `BBC-1` definindo package manager/runtime oficial, comandos reais de verificação, envs obrigatórios e o status real de Zod/typecheck no baseline atual.",
      ].join("\n\n"),
    });

    expect(normalized).toContain("Repository context is sufficient for the first CTO hire.");
    expect(normalized).toContain("Accept repository context from Project Intake, then generate the CTO hiring brief.");
    expect(normalized).toContain("<!-- paperclip:baseline-ceo-review-decision decision=\"sufficient_for_first_cto\" -->");
    expect(normalized).not.toContain("não está pronto para delegação");
    expect(normalized).not.toContain("contexto operacional adicional");
    expect(normalized).not.toContain("freshness note");
  });
});
