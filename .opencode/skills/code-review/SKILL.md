---
name: code-review
description: Perform code reviews following Sentry engineering practices. Use when reviewing pull requests, examining code changes, or providing feedback on code quality. Covers security, performance, testing, and design review. Official skill vendored from getsentry/skills.
---

# Sentry Code Review

Follow these guidelines when reviewing code for Sentry projects.

## Review Checklist

### Identifying Problems

Look for these issues in code changes:

- **Runtime errors**: Potential exceptions, null pointer issues, out-of-bounds access
- **Performance**: Unbounded O(n²) operations, N+1 queries, unnecessary allocations
- **Side effects**: Unintended behavioral changes affecting other components
- **Backwards compatibility**: Breaking API changes without migration path
- **ORM queries**: Complex ORM with unexpected query performance
- **Security vulnerabilities**: Injection, XSS, access control gaps, secrets exposure

### Design Assessment

- Do component interactions make logical sense?
- Does the change align with existing project architecture?
- Are there conflicts with current requirements or goals?

### Test Coverage

Every PR should have appropriate test coverage:

- Functional tests for business logic
- Integration tests for component interactions
- End-to-end tests for critical user paths

Verify tests cover actual requirements and edge cases. Avoid excessive branching or looping in test code.

### Long-Term Impact

Flag for senior engineer review when changes involve:

- Database schema modifications
- API contract changes
- New framework or library adoption
- Performance-critical code paths
- Security-sensitive functionality

## Feedback Guidelines

### Tone

- Be polite and empathetic
- Provide actionable suggestions, not vague criticism
- Phrase as questions when uncertain: "Have you considered...?"

### Approval

- Approve when only minor issues remain
- Don't block PRs for stylistic preferences
- Remember: the goal is risk reduction, not perfect code

## Common Patterns to Flag

### TypeScript/React

```typescript
// Bad: Missing dependency in useEffect
useEffect(() => {
  fetchData(userId);
}, []);  // userId not in deps

// Good: Include all dependencies
useEffect(() => {
  fetchData(userId);
}, [userId]);
```

### Security

```typescript
// Bad: SQL injection risk
// Good: Parameterized query (Drizzle sql template tags or eq()/and() helpers)
```

## References

- [Sentry Code Review Guidelines](https://develop.sentry.dev/engineering-practices/code-review/)
- Also apply this project's rules in `AGENTS.md` (workflow protocol, security rules, DB/perf conventions).