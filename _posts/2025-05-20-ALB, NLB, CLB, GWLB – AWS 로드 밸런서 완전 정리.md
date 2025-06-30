---

title: "ALB, NLB, CLB, GWLB – AWS 로드 밸런서 완전 정리"
date: 2025-05-20 00:00:00 +0900
categories: [tech, cloud]
tags: [AWS, ALB, NLB, CLB, GWLB, 로드밸런서]
sidebar:
  nav: "docs"
toc: true
toc_sticky: true
# classes: wide
excerpt : AWS 로드 밸런서 4종 완전 비교. 어떤 상황에 어떤 걸 써야 할까?
header:
  teaser: /assets/images/post_img/로드밸런서.png

---
## 1. 들어가며

AWS에서 서비스를 운영하다 보면, 로드 밸런서는 거의 필수다.  
하지만 ELB 안에도 종류가 4가지나 있어서 처음 접하면 헷갈리기 쉽다.

- 웹 서비스엔 ALB?
- 게임 서버엔 NLB?
- 옛날 시스템은 CLB?
- 방화벽 연결엔 GWLB?

이번 글에서는 AWS의 로드 밸런서 종류를 한 번에 정리해보고, 각 로드 밸런서가 어떤 상황에 적합한지 사례를 들어가며 설명해보려고 한다.

---

## 2. 전체 비교표로 빠르게 보기

| 종류  | 풀네임                        | 계층 | 주요 목적                        | 특징 요약                            |
|-------|-----------------------------|------|-------------------------------|------------------------------------|
| ALB   | Application Load Balancer  | L7   | HTTP/HTTPS 트래픽 처리        | 경로/호스트 기반 라우팅, 웹 앱에 특화 |
| NLB   | Network Load Balancer      | L4   | TCP/UDP 기반 초고속 통신       | 정적 IP, TLS 종료 가능, 초고성능   |
| CLB   | Classic Load Balancer      | L4/L7| 구형 아키텍처 호환             | 과거 시스템 유지용, 기능 제한적    |
| GWLB  | Gateway Load Balancer      | L3/L4| 보안 장비 트래픽 미러링 등 연동 | 서드파티 방화벽, IDS 등과 연동 용도 |

---

## 3. ALB – Application Load Balancer

![Application_Load_Balancer](/assets/images/post_img/Application_Load_Balancer.png)


웹 애플리케이션에 특화된 L7 로드 밸런서이다.  
HTTP, HTTPS 트래픽에 대해 경로 기반 또는 호스트 기반 라우팅이 가능하다.

### 주요 특징
- L7 (Application Layer)에서 동작
- `/api` → A 서비스, `/admin` → B 서비스처럼 경로 기반 분기 가능
- WebSocket, HTTP/2 지원
- 대상 그룹: EC2, Lambda, Fargate, IP 등 유연

### 사용 예시
- REST API 서버
- 마이크로서비스 기반 아키텍처
- 정적 리소스와 동적 컨텐츠를 분리해서 배포할 때

---

## 4. NLB – Network Load Balancer

![Network_Load_Balancer](/assets/images/post_img/Network_Load_Balancer.png)

초당 수백만 요청을 처리할 수 있는 L4 로드 밸런서이다.  
게임 서버나 실시간 서비스에 적합하다.

### 주요 특징
- L4 (Transport Layer)에서 TCP/UDP 트래픽 처리
- 정적 IP 할당 가능
- TLS 종료 가능 (SSL 인증서 적용)
- 초고속 처리: ALB보다 훨씬 빠름

### 사용 예시
- 온라인 게임 서버
- 금융 시스템
- WebRTC 기반 서비스, 실시간 IoT 통신

---

## 5. CLB – Classic Load Balancer

![Classic_Load_Balancer](/assets/images/post_img/Classic_Load_Balancer.png)


예전부터 AWS에서 제공하던 로드 밸런서로, ALB/NLB 이전 세대이다.  
L4/L7 모두 지원하지만 기능은 제한적이다.

### 주요 특징
- L4 + L7 혼합 지원
- HTTP 헤더 기반 라우팅은 어려움
- 더 이상 신규 권장되지 않음 (기존 유지용)

### 사용 예시
- 구형 시스템 유지보수
- 마이그레이션 전까지 임시 유지

---

## 6. GWLB – Gateway Load Balancer

![Gateway_Load_Balancer](/assets/images/post_img/Gateway_Load_Balancer.png)

L3/L4 계층에서 네트워크 장비와 트래픽을 중계해주는 로드 밸런서이다.  
가상 방화벽, IDS/IPS 같은 보안 장비 연동용으로 사용된다.

### 주요 특징
- L3 (Network Layer)에서 동작
- 패킷 미러링 및 VPC 트래픽 가시화
- 서드파티 네트워크 장비와 연동 가능 (Fortinet, Palo Alto 등)

### 사용 예시
- EC2 기반 가상 방화벽 연동
- 기업 보안 솔루션 통합
- VPC 내부 트래픽 모니터링

---

## 7. 어떤 걸 언제 써야 할까?

| 상황 | 추천 로드 밸런서 |
|------|-----------------|
| 웹 서비스, REST API | ALB |
| 초고속, 실시간 통신 | NLB |
| 옛날 시스템 유지 | CLB |
| 보안 장비 연동 | GWLB |

---

## 8. 마무리하며

로드 밸런서 선택은 단순히 트래픽을 분산시키는 것 이상의 결정이다.  
어떤 계층에서 동작하느냐, 어떤 기능이 필요한지에 따라 ALB, NLB, GWLB 중 선택이 갈리게 된다.  
CLB는 이제 유지보수 목적으로만 사용하고, 신규 시스템에는 사용을 피하는 것이 좋다.