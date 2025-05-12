---

title: "AWS Bedrock 지식기반을 A to Z 모두 구현해보기"
date: 2025-05-12 00:00:00 +0900
categories: [cloud, ai, Business]
tags: [AWS, AI, Bedrock, RAG, Retrieval-Augmented Generation, LLM, Knowledge Base, 지식기반]
sidebar:
  nav: "docs"
toc: true
toc_sticky: true
classes: wide
header:
  teaser: /assets/images/post_img/Knowledge-Bases-feat-img.png
excerpt : 직접 AWS 완전관리형 서비스 따라만들어보자
---

## 1. 들어가며

최근 다양한 기업들이 사내 문서 기반 지식 검색 시스템, 즉 RAG(Retrieval-Augmented Generation) 기반의 챗봇을 도입하고 있다. [[Gartner 보고서 보기](https://www.gartner.com/en/articles), 
[Accenture AI 인사이트](https://www.accenture.com/us-en/insights/artificial-intelligence), 
[McKinsey: 생성형 AI의 경제적 잠재력](https://www.mckinsey.com/featured-insights/generative-ai), 
[AWS GenAI 공개 고객 사례집](https://antique-skipjack-fdd.notion.site/AWS-GenAI-17876a71128680798755e8b90bd1a89f)]

![AWS Gen AI 사례모음](/assets/images/post_img/awsgenai.png)


특히 [AWS Bedrock](https://docs.aws.amazon.com/ko_kr/bedrock/latest/userguide/what-is-bedrock.html)은 Amazon Titan, Claude, Command 등을 통합 제공하며, LLM 기반 지식 응답 시스템을 완전관리형으로 구성할 수 있는 매우 강력한 플랫폼이다.

실제로 Bedrock에서는 Knowledge Base 기능을 통해 콘솔에서 클릭 몇 번으로 지식기반 챗봇을 만들 수 있다.
S3 버킷, Amazon OpenSearch, RDS 등 다양한 데이터 소스를 연결하면, 문서 임베딩과 검색 인덱싱 과정이 자동으로 처리되고, Claude 모델 기반의 응답까지 즉시 받을 수 있다.
별도의 Lambda나 서버 인프라를 쉽게 설정이 가능하고 출처 인용이 포함된 고품질 응답을 빠르게 생성할 수 있다는 점은 분명한 장점이다.

하지만 이번 글에서는 이러한 완전관리형 서비스가 내부적으로 어떤 과정을 거치는지 직접 구현해보는 것을 목표로 삼았다.
파일 업로드부터 문서 변환, 텍스트 추출, chunk 임베딩, OpenSearch 저장, [AWS Bedrock](https://docs.aws.amazon.com/ko_kr/bedrock/latest/userguide/what-is-bedrock.html)을 활용한 Claude 응답 생성까지의 전체 파이프라인을 AWS의 여러 서비스를 조합해 수동으로 구성했다.

이 과정을 통해 Bedrock의 Knowledge Base 기능이 내부적으로 수행하는 동작들을 명확히 이해하고,
직접 구축한 RAG 파이프라인과 완전관리형 Knowledge Base를 비교 분석해보려 한다.

## 2. 전체 구성 아키텍처

이번 프로젝트는 AWS Bedrock의 Knowledge Base에서 제공하는 완전관리형 RAG 구조를 모방해, 개별 AWS 서비스를 조합하여 Lambda 기반의 지식기반 질의응답 시스템을 직접 구성한 형태다.

전체 플로우는 다음과 같이 문서 업로드 → PDF 변환 및 텍스트 추출 → 임베딩 → OpenSearch 저장 → 질의응답으로 구성되어 있으며, 모든 단계는 서버리스형(~~서버있는~~) Lambda 함수와 이벤트 기반으로 연결되어 있다.

```
 [사용자]
     │
     ▼
S3 presigned URL (원본 업로드) ───────────▶ S3 
                                (raw-files-bucket)
                                         │
                                         ▼
                               [Lambda] doc-extract
                              (파일 유형 검사 및 PDF 변환)
                                         │
                                         ▼
                            텍스트 추출 + chunk 생성
                          (문단 단위 + 페이지 번호 포함)
                                         │
                                         ▼
                         Bedrock (Titan) - 임베딩 생성
                                         │
                                         ▼
                        [Lambda] doc-embed → OpenSearch 저장
                                         │
                                         ▼
                                  파일 상태 업데이트 
                              (DynamoDB: files 테이블)
                                         │
                                         │
                                       사용자
                                         │
                                         │
                                사용자 질의 요청 (API Gateway)
                                         │
                                         ▼
                         [Lambda] query_send (RAG 응답 처리)
                          └─ Claude 3.5 Sonnet 기반 응답 생성
                          └─ 관련 chunk citation 포함

```

### 사용된 주요 서비스

| 서비스               | 역할                                                                 |
|--------------------|----------------------------------------------------------------------|
| **S3**             | 원본 파일 및 변환 PDF 저장 (raw & converted 버킷 분리)                |
| **Lambda**         | 문서 처리 및 질의응답 전체 로직 수행 (`extract`, `embed`, `query_send`) |
| **Bedrock (Titan, Claude)** | 텍스트 임베딩 생성 및 질의에 대한 응답 생성                              |
| **OpenSearch**     | 문서 chunk 벡터 저장 및 유사도 기반 검색                              |
| **DynamoDB**       | 파일 및 세션 상태 관리 (`lexora-files`, `lexora-query-sessions`)     |
| **API Gateway**    | 사용자 요청 엔드포인트 제공                                           |
| **CloudWatch Logs**| 각 Lambda 디버깅 및 오류 추적용 로깅                                  |


### 주요 특징

- 완전 자동 파이프라인: 사용자는 파일을 업로드하기만 하면, 내부적으로 PDF 변환, 텍스트 추출, chunk화, 임베딩 저장까지 모든 처리가 자동으로 이루어짐

- 출처 추적 기반 RAG 응답: 질의 시 Claude 모델을 통해 생성된 응답에 대해 관련 문서 출처(파일명 / chunk 번호 / 페이지 번호)를 포함

- 세션 기반 대화 흐름 유지: DynamoDB의 query-sessions 테이블을 통해 대화 문맥 유지

## 3. Bedrock Knowledge Base – 완전관리형 구조 소개


AWS Bedrock의 **Knowledge Base**는 생성형 AI 응답 시스템을 손쉽게 구축할 수 있도록 도와주는 **완전관리형 RAG 서비스**입니다. 별도의 서버 구축이나 인프라 설계 없이도, 콘솔 상에서 몇 번의 클릭만으로 다음과 같은 복잡한 과정을 자동화할 수 있습니다:

![Knowledge_Base](/assets/images/post_img/Knowledge_Base.png)

위 그림은 콘솔에서 지식기반 사용하는 방법

### 주요 구성 요소

| 구성 요소 | 설명 |
| --- | --- |
| **데이터 소스 연결** | S3, Amazon Aurora, OpenSearch 등 다양한 문서 저장소와 직접 연결 가능 |
| **임베딩 모델 선택** | Amazon Titan Text Embedding 모델을 기반으로 자동 임베딩 생성 |
| **벡터 저장소 구성** | 사용자가 지정한 OpenSearch Service를 벡터 저장소로 활용 |
| **질의 모델 선택** | Claude, Command 등 Bedrock 내 다양한 LLM 중 선택 가능 |
| **API 호출** | 생성된 Knowledge Base에 대해 API로 질의 응답 수행 가능 |


![bedrock_moelcatalog](/assets/images/post_img/bedrock_moelcatalog.png)

ap-northeast-2 서울 리전에서 현재 사용할 수 있는 모델의 종류는 157개가 있습니다.
* * *

### 내부 동작 방식

Knowledge Base가 수행하는 전반적인 흐름은 아래와 같습니다:

```
[사용자] 
    └▶ S3 버킷에 문서 업로드
        └▶ Bedrock Knowledge Base에서 자동 감지
            └▶ Titan Embedding 모델을 통해 텍스트 임베딩 생성
                └▶ 지정된 OpenSearch에 벡터 저장
                    └▶ 질의 발생 시 관련 chunk 검색 + LLM 응답 생성
```

* * *

### 사용자 관점에서의 구성 흐름

1.  **S3 문서 업로드**  
    콘솔 또는 API를 통해 `.pdf`, `.txt`, `.docx` 등의 문서를 S3에 업로드합니다.
    
2.  **Knowledge Base 구성**  
    Bedrock 콘솔에서 Knowledge Base를 생성하면서:
    
    *   연결할 S3 버킷 및 프리픽스 지정        
    *   사용할 임베딩 모델 (예: `amazon.titan-embed-text-v1`)        
    *   벡터 저장소 (예: OpenSearch domain)        
    *   사용할 응답 모델 (예: Claude 3)
        
3.  **자동 임베딩 생성 및 저장**  
    업로드된 문서들은 자동으로 분할(chunking)되고, Titan 임베딩 모델을 통해 벡터화되어 OpenSearch에 저장됩니다.
    
4.  **질의 응답 처리**  
    이후 사용자 질의가 들어오면 Bedrock은 유사한 chunk를 검색하고, 선택된 LLM(예: Claude)으로 답변을 생성합니다.  
    이때 응답에는 **관련 문서 출처 정보**도 함께 포함됩니다.
    

* * *

### 특징 및 장점

*   **클릭 기반 구성**  
    AWS 콘솔 또는 `CreateKnowledgeBase` API를 통해 몇 단계로 빠르게 설정 가능    
*   **자동화된 문서 파싱 및 인덱싱**  
    별도의 Lambda나 Glue job 없이도 PDF, DOCX 등 다양한 문서를 자동 분석 및 처리    
*   **출처 기반 응답**  
    Claude 등 LLM의 생성 응답에 사용된 문서 chunk의 **source URI** 또는 **chunk ID**가 포함되어 신뢰도 향상
*   **보안 및 권한 통합**  
    IAM 기반 접근 제어, S3 정책, OpenSearch 정책 등이 함께 작동
*   **API 기반 통합**  
    AWS SDK 또는 Bedrock Runtime API를 통해 챗봇, 내부 서비스 등과 손쉽게 연동 가능
    

* * *

### 사용 예시

```bash
# Knowledge Base에서 생성된 KB ID를 통해 질의
POST /knowledge-base/query
{
  "knowledgeBaseId": "kb-xxxxxxxx",
  "input": "퇴사자 보안 정책은 어떻게 관리하나요?"
}
```

→ Claude 모델이 OpenSearch에서 관련 문서를 검색하고, 관련 출처와 함께 자연어 답변을 생성합니다.


## 4. 수동 구현: RAG 파이프라인 상세 단계
Bedrock Knowledge Base는 S3에 문서를 업로드하면 임베딩부터 응답 생성까지 자동으로 수행합니다. 하지만 이 장에서는 그 내부 흐름을 **AWS 서비스 조합으로 수동 구현한 방식**을 단계별로 설명합니다.

이 방식은 실제 프로덕션 환경에서 **커스터마이징**이 필요할 때 유용하며, Bedrock의 추상화된 기능을 명확하게 이해하는 데도 도움이 됩니다.

모든 과정은 콘솔이 아닌 cdk형태로 만들어 cloud formation으로 업로드하는 방식으로 제작을 진행하였다.

* * *

### 4.1. 파일 업로드 및 PDF 변환

모든 과정은 콘솔이 아닌 cdk형태로 만들어 cloud formation으로 업로드하는 방식으로 제작을 진행하였다.
#### ■ 흐름 설명

*   사용자가 프론트엔드에서 파일을 업로드하면, 프리사인 URL을 이용해 \*\*`raw-files-bucket`\*\*에 직접 저장됩니다.    
*   업로드 완료 후, Lambda에 의해 SQS 메시지가 트리거되어 **`doc-extract` Lambda**가 실행됩니다.    
*   이 Lambda는 파일 유형을 검사한 뒤:    
    *   `.docx`, `.pptx` 등 비PDF 문서는 **LibreOffice 기반 Docker Lambda**에서 PDF로 변환        
    *   이미 PDF일 경우, 그대로 복사만 수행
        

#### ■ 사용된 서비스

| 서비스 | 역할 |
| --- | --- |
| S3 (`raw-files-bucket`) | 사용자 원본 업로드 버킷 |
| S3 (`converted-files-bucket`) | PDF 변환 결과 저장 |
| Lambda (`doc-extract`) | 파일 변환 및 추출 시작 처리 |
| SQS | 업로드 완료 후 Lambda 호출을 위한 이벤트 트리거 |

* * *

### 4.2. 텍스트 추출 및 Chunk 생성

#### ■ 흐름 설명

*   PDF 파일을 대상으로 **PyMuPDF**를 사용해 텍스트를 페이지 단위로 추출합니다.    
*   추출된 텍스트는 다음 기준으로 문단 단위로 분할(chunking)합니다:    
    *   한 chunk는 최대 500 tokens 수준        
    *   각 chunk에는 **소속 파일 ID, 페이지 번호, chunk 번호** 포함        
*   이 결과는 `.jsonl` 형태로 저장되며, 다음 단계 임베딩 처리를 위해 전달됩니다.
    

#### ■ 사용된 기술 및 고려사항

*   PyMuPDF 기반 추출 (한국어 PDF 인식률 높음)    
*   page-break 및 heading 인식 기능 고려    
*   각 chunk에 대한 메타데이터 구조는 다음과 같음:
    

```json
{
  "chunkId": "fileId-3",
  "fileId": "abc123",
  "page": 5,
  "content": "이 문단은 PDF 5페이지에서 추출된 문단입니다."
}
```

* * *

### 4.3. 임베딩 생성 및 OpenSearch 저장

#### ■ 흐름 설명

*   생성된 각 chunk는 `doc-embed` Lambda를 통해 **Amazon Bedrock의 Titan Embed 모델**에 요청하여 벡터 임베딩을 생성합니다.    
*   결과로 받은 벡터는 다음 필드와 함께 OpenSearch에 저장됩니다:    
    *   `chunkId`, `fileId`, `page`, `content`, `embedding`        
*   OpenSearch는 `k-NN` 벡터 인덱스를 기반으로 구성되어, 유사도 검색에 최적화되어 있습니다.
    

#### ■ 사용된 서비스

| 서비스 | 역할 |
| --- | --- |
| Bedrock (`amazon.titan-embed-text-v2:0`) | 텍스트 임베딩 생성 |
| Lambda (`doc-embed`) | chunk → 벡터 임베딩 처리 |
| OpenSearch | 벡터 기반 검색 인덱싱 저장소 |
| DynamoDB (`lexora-files`) | 처리 상태 `embedded`로 업데이트 |

* * *

### 4.4. 사용자 질의 및 Claude 기반 응답

#### ■ 흐름 설명

*   사용자가 API Gateway를 통해 질의하면, `query_send` Lambda가 실행됩니다.    
*   입력 질의에 대해 Titan 임베딩 모델을 사용해 임베딩 생성    
*   OpenSearch에서 top-k 관련 chunk 검색    
*   검색된 chunk들을 context로 Claude 3.5 Sonnet에 전달해 응답 생성    
*   응답에는 사용된 chunk들의 출처(citation: 파일명 / 페이지 / chunk 번호)를 포함합니다.
    

#### ■ 사용된 서비스

| 서비스 | 역할 |
| --- | --- |
| API Gateway | 사용자 질의 수신 |
| Lambda (`query_send`) | 질의 처리 및 RAG 응답 생성 |
| Bedrock (Claude 3.5 Sonnet) | 자연어 응답 생성 |
| DynamoDB (`lexora-query-sessions`) | 대화 세션 및 흐름 유지 |
| OpenSearch | 유사 chunk 검색 |

#### ■ 실제 동작 화면

![alt text](/assets/images/post_img/bedrock_example.png)

파일 ID를 등록하고 프롬프트를 기입하여 해당 파일의 임베딩된 텍스트(벡터) 중 가장 유사한 청크들을 가져와서 현재 프롬프트와 함께 Claude 모델에 질의를 진행한 결과입니다.

답변을 파싱하기 쉽도록 json형태와 마크다운을 함께 사용하여 추출을 진행하였습니다.

## 5. 완전관리형 Knowledge Base vs 수동 구현 비교

이전 장에서 설명한 것처럼 AWS Bedrock의 Knowledge Base는 많은 과정을 자동화해주지만, 사용자가 직접 AWS 서비스 조합으로 수동 구현하면 더 높은 수준의 커스터마이징이 가능합니다.  
이 장에서는 **두 방식의 기능, 유연성, 운영 부담 등을 항목별로 비교**합니다.

### 5.1 기능 및 아키텍처 비교

| 항목 | Bedrock Knowledge Base (완전관리형) | 수동 구현 (Lambda 기반 RAG) |
| --- | --- | --- |
| 구성 방식 | 콘솔 클릭 또는 API 기반 설정 | S3 + Lambda + Bedrock + OpenSearch 조합 |
| 문서 처리 | 자동 임베딩 및 인덱싱 | PDF 변환, 텍스트 추출, chunk 생성 수동 구현 |
| 임베딩 모델 | Titan만 사용 가능 | Titan 외 다른 모델(Bedrock, 외부 API) 선택 가능 |
| 벡터 저장소 | OpenSearch 고정 | OpenSearch 외 Pinecone, Faiss 등도 가능 |
| 응답 모델 | Claude, Command 등 선택 | Claude, GPT, Gemini 등 확장 가능 |
| 응답 포맷 | 고정(JSON + 출처 포함) | 원하는 포맷으로 파싱 가능 (예: 마크다운, 하이라이트 등) |
| 보안 제어 | IAM, S3 정책 기반 | IAM + 사용자 인증 로직 커스터마이징 가능 |
| 확장성 | 제한적 (콘솔 UI 중심) | 유연하게 구성 가능 (멀티 파일 필터링, 접근 권한 분리 등) |

* * *

### 5.2 사용성 vs 유연성

| 항목 | Knowledge Base | 수동 구현 방식 |
| --- | --- | --- |
| 초기 구축 난이도 | 매우 쉬움 | 중간~높음 (Lambda, S3, API 연동 필요) |
| 커스터마이징 | 낮음 (제공 범위 내 제한) | 매우 높음 (세부 로직 자유 구성 가능) |
| 운영 편의성 | 매우 좋음 (Fully Managed) | 직접 모니터링/로깅 구성 필요 |
| 장애 대응 | AWS 내부 처리 | 에러 핸들링/로그 추적 직접 설계 필요 |
| 비용 구조 | 단순 (Bedrock 호출 기반) | Lambda, S3, OpenSearch, API Gateway 등 종합 고려 |

* * *

### 5.3 선택 기준 정리

| 상황 | 추천 방식 |
| --- | --- |
| **빠르게 PoC를 만들어야 할 때** | Knowledge Base |
| **기획/디자인 없이도 즉시 챗봇 만들고 싶을 때** | Knowledge Base |
| **PDF 외 다양한 문서 포맷이나 규칙 기반 문서 처리 필요** | 수동 구현 |
| **출처 포맷, UI 응답 커스터마이징이 필요할 때** | 수동 구현 |
| **모델 확장(GPT 등)이나 다중 파일 필터링/검색 기능이 필요할 때** | 수동 구현 |


## 6. 마무리하며 – 느낀 점

이번 프로젝트를 통해 AWS Bedrock의 Knowledge Base가 제공하는 완전관리형 구조가 얼마나 강력하고 간편한지 직접 체감할 수 있었다. 클릭 몇 번만으로 PDF 문서를 업로드하고, LLM 기반의 답변을 받을 수 있다는 점은 단순한 데모 이상의 실용성을 제공한다.

반면, 수동 구현을 통해 각 단계를 직접 구성해보면서 Knowledge Base가 내부적으로 처리하고 있는 다양한 과정을 명확히 이해할 수 있었다. 특히 PDF 변환, 텍스트 추출, 임베딩 생성, 벡터 검색, 응답 생성 등 각각의 단계를 세밀하게 제어할 수 있다는 점은 실제 서비스 환경에서 매우 큰 장점이 된다.

