---
name: commit
description: git 변경사항을 논리적 단위로 커밋한다.
argument-hint: "[push]"
---

Kent Beck의 원칙에 따라 commit message를 작성한다. **작고, 자주, 행동 단위가 명확하게**

$ARGUMENTS가 `push`일 경우 remote로 push한다.

## 컨벤션

monorepo이므로, commit message에 scope를 포함한다. 커밋 플래그

e.g. `feat(shared): 어떤 API DTO 정의`, `fix(api): 런타임 예외 처리`, `refactor(frontend): view와 hook 분리`