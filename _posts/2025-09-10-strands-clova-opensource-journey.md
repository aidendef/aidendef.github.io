---

title: "한국 AI를 세계로: strands-clova 오픈소스 개발 여정"
date: 2025-09-10 00:00:00 +0900
categories: [development, opensource, ai]
tags: [OpenSource, Python, AI, CLOVA, StrandsAgents, 한국어AI, PyPI, GitHub]
sidebar:
  nav: "docs"
toc: true
toc_sticky: true
excerpt: CLOVA Studio를 Strands Agents SDK에 통합하면서 겪은 오픈소스 기여의 실제 여정
header:
  teaser: /assets/images/post_img/strands-clova-journey.png

---

## 한국어 AI, 글로벌 무대에 서다

**"왜 한국의 우수한 AI 기술이 글로벌 오픈소스 생태계에서는 찾아보기 힘들까?"**

이 질문에서 시작된 프로젝트가 결국 PyPI 패키지 발행까지 이어진 여정을 공유합니다. 단순히 코드를 작성하는 것을 넘어, 오픈소스 커뮤니티와 소통하고, 피드백을 수용하며, 최종적으로 전 세계 개발자들이 사용할 수 있는 패키지를 만들기까지의 과정을 담았습니다.

---

## 1. 시작: Strands Agents SDK와의 만남

### Strands Agents SDK란?

[Strands Agents SDK](https://github.com/strands-agents/sdk-python)는 AI 에이전트를 구축하기 위한 강력한 Python 프레임워크입니다. 

```python
from strands import Agent
from strands.models import OpenAIModel

# 다양한 AI 모델을 통합 인터페이스로 사용
model = OpenAIModel(api_key="your-key")
agent = Agent(model=model)
response = await agent.invoke_async("Hello, world!")
```

주요 특징:
- **통합 인터페이스**: OpenAI, Anthropic, Google 등 다양한 모델 지원
- **도구(Tools) 시스템**: 파일 읽기, 웹 검색 등 다양한 기능 통합
- **스트리밍 지원**: 실시간 응답 처리
- **타입 안정성**: 완벽한 타입 힌트 지원

### 발견한 문제점

Strands는 글로벌 AI 모델들을 훌륭하게 지원하지만, **한국어에 특화된 모델 지원이 전무**했습니다. 

CLOVA Studio는 네이버가 개발한 한국어 최적화 AI 모델로:
- 한국어 문맥과 뉘앙스를 정확하게 이해
- 한국 문화와 관습에 대한 깊은 이해
- 한국어-영어 번역 및 혼용 처리 능력

이런 강점에도 불구하고 Strands 생태계에서는 사용할 수 없었습니다.

---

## 2. 도전: 직접 통합 구현하기

### Issue #802 생성

2025년 9월, 공식 저장소에 [이슈를 생성](https://github.com/strands-agents/sdk-python/issues/802)했습니다:

```markdown
Title: Add CLOVA Studio model provider support for Korean language

CLOVA Studio는 네이버의 한국어 AI 플랫폼으로, 
한국어 처리에 특화된 강력한 모델을 제공합니다...
```

### 기술적 구현 과정

SDK의 아키텍처를 분석하고, Model 추상 클래스를 상속받아 ClovaModel을 구현했습니다:

```python
class ClovaModel(Model):
    """CLOVA Studio model provider implementation."""
    
    def __init__(
        self,
        model: str = "HCX-005",
        api_key: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        **kwargs: Any,
    ):
        # CLOVA API 초기화
        self.api_key = api_key or os.getenv("CLOVA_API_KEY")
        if not self.api_key:
            raise ValueError("CLOVA API key is required")
```

### 핵심 기술적 도전 과제

#### 1. SSE (Server-Sent Events) 파싱

CLOVA는 독특한 SSE 응답 형식을 사용했습니다. 일반적인 SSE와 달리 모든 이벤트가 단일 청크로 전송되어 커스텀 파서가 필요했습니다:

```python
async def parse_sse_stream(self, response):
    buffer = b""
    async for chunk in response.aiter_bytes():
        buffer += chunk
        events = buffer.split(b"\n\n")
        buffer = events[-1]
        
        for event in events[:-1]:
            # CLOVA 특화 이벤트 파싱
            data = self.parse_event_data(event)
            yield data
```

#### 2. 타입 시스템 호환성

Strands의 엄격한 타입 시스템과 호환성을 유지하는 것이 중요했습니다:

```python
from strands.types.streaming import StreamEvent, ContentBlockDelta

# 올바른 타입 구조 사용
delta: ContentBlockDelta = {"text": content}
event: ContentBlockDeltaEvent = {"delta": delta}
yield {"contentBlockDelta": event}
```

### PR #803 제출

구현을 완료하고 [PR #803](https://github.com/strands-agents/sdk-python/pull/803)을 제출했습니다:
- 10개의 단위 테스트
- 8개의 통합 테스트
- 완벽한 문서화
- CI/CD 통과

---

## 3. 전환점: 메인테이너의 피드백

### 예상치 못한 방향 전환

PR을 제출한 후, 메인테이너 @yonib05로부터 중요한 피드백을 받았습니다:

> "Thank you for this PR! While we'd love to include every great model provider, we need to be selective about adding to the core SDK. **We'd recommend publishing as a standalone package on PyPI instead.**"

처음에는 실망스러웠지만, 곧 이것이 더 나은 방향임을 깨달았습니다:
- **독립적인 버전 관리**: SDK 릴리즈 주기에 종속되지 않음
- **빠른 업데이트**: 즉각적인 버그 수정과 기능 추가
- **선택적 설치**: 필요한 사용자만 설치

---

## 4. 재탄생: 독립 패키지 개발

### 프로젝트 구조 설계

```
strands-clova/
├── src/strands_clova/
│   ├── __init__.py       # 패키지 진입점
│   ├── clova.py          # 핵심 구현
│   └── py.typed          # 타입 힌트 지원
├── tests/
│   ├── unit/             # 단위 테스트
│   └── integration/      # 통합 테스트
├── examples/             # 사용 예제
├── .github/workflows/    # CI/CD
├── pyproject.toml        # 패키지 설정
└── README.md            # 문서
```

### pyproject.toml 설정

```toml
[project]
name = "strands-clova"
version = "0.1.0"
description = "CLOVA Studio model provider for Strands Agents SDK"
requires-python = ">=3.10"
dependencies = [
    "strands-agents>=1.7.0",
    "httpx>=0.27.0",
    "pydantic>=2.0.0",
]
```

### GitHub Actions CI/CD

```yaml
name: CI

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ["3.10", "3.11", "3.12"]
```

---

## 5. 시행착오: 문제 해결 과정

### Python 버전 호환성 이슈

초기에는 Python 3.8+를 지원하려 했으나, GitHub Actions에서 실패:

```
ERROR: No matching distribution found for strands-agents==1.7.1 
(requires Python >=3.10)
```

해결: Python 3.10+로 요구사항 업데이트

### 타입 체킹 오류

mypy에서 수많은 타입 오류 발생:

```python
# 문제
yield {"type": "text", "text": content}

# 해결
delta: ContentBlockDelta = {"text": content}
event: ContentBlockDeltaEvent = {"delta": delta}
yield {"contentBlockDelta": event}
```

---

## 6. 완성: PyPI 패키지 발행

### 패키지 빌드

```bash
python -m build
```

### PyPI 업로드

```bash
twine upload dist/*
```

### 최종 결과

✅ **PyPI**: https://pypi.org/project/strands-clova/  
✅ **GitHub**: https://github.com/aidendef/strands-clova  
✅ **설치**: `pip install strands-clova`

---

## 7. 사용법: 5분 만에 시작하기

### 설치

```bash
pip install strands-agents strands-clova
```

### 기본 사용

```python
from strands_clova import ClovaModel
from strands import Agent

# CLOVA 모델 초기화
model = ClovaModel(
    api_key="your-clova-api-key",  # 또는 CLOVA_API_KEY 환경변수
    model="HCX-005",
    temperature=0.7,
    max_tokens=2048
)

# 에이전트 생성
agent = Agent(model=model)

# 한국어 처리
response = await agent.invoke_async("한국의 전통 음식을 소개해주세요")
print(response.message)
```

### 스트리밍 예제

```python
async for event in model.stream("AI가 미래에 미칠 영향은?"):
    if "contentBlockDelta" in event:
        delta = event["contentBlockDelta"]["delta"]
        if "text" in delta:
            print(delta["text"], end="", flush=True)
```

---

## 8. 배운 교훈들

### 오픈소스는 코드 그 이상

- 커뮤니티와의 소통: 메인테이너의 피드백을 긍정적으로 수용
- 유연한 사고: 직접 통합에서 독립 패키지로 방향 전환
- 문서화의 중요성: README, 예제, API 문서는 필수

### 기술적 교훈

- 테스트의 중요성: 18개의 테스트가 안정성 보장
- CI/CD 자동화: GitHub Actions로 품질 관리
- 타입 안정성: TypeScript처럼 Python도 타입 힌트 활용

### 글로벌 프로젝트 참여

- 영어 문서화: 명확하고 간결한 영어 문서 작성
- 표준 준수: Python 패키징 표준 (PEP) 준수
- 라이선스: MIT 라이선스로 자유로운 사용 보장

---

## 마무리: 작은 시작이 만드는 변화

이 프로젝트는 단순한 기술적 도전을 넘어, **한국 AI 기술을 글로벌 오픈소스 생태계에 통합**하는 의미있는 작업이었습니다. 

strands-clova는 이제:
- 전 세계 개발자들이 한국어 AI를 쉽게 사용할 수 있는 다리
- 한국 개발자들이 Strands 생태계를 활용할 수 있는 도구
- 오픈소스 기여의 실제 사례

**오픈소스 기여를 망설이고 계신가요?**

시작은 작을 수 있습니다. 이슈 제기, 문서 개선, 버그 리포트... 모든 기여는 가치있습니다. 제 경험이 보여주듯, 때로는 거절당한 PR이 더 큰 기회로 이어질 수 있습니다.


---

## Links

- **GitHub**: [github.com/aidendef/strands-clova](https://github.com/aidendef/strands-clova)
- **PyPI**: [pypi.org/project/strands-clova](https://pypi.org/project/strands-clova/)
- **Original PR**: [PR #803](https://github.com/strands-agents/sdk-python/pull/803)
- **Issue**: [Issue #802](https://github.com/strands-agents/sdk-python/issues/802)
- **Strands Agents SDK**: [github.com/strands-agents/sdk-python](https://github.com/strands-agents/sdk-python)

---

*이 글이 도움이 되셨다면, GitHub에서 ⭐를 눌러주세요!*