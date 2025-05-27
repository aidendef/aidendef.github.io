---

title: "Agentic_Workflow_using_LangGraph_and_Bedrock(1)"
date: 2025-05-27 00:01:00 +0900
categories: [ai, cloud]
tags: [AWS, Agentic, LangGraph, Bedrock]
sidebar:
  nav: "docs"
toc: true
toc_sticky: true
# classes: wide
excerpt : 그래프를 알아보자
header:
  teaser: /assets/images/post_img/langgraph1.png
---
## 간단한 그래프

LangGraph에서 개념을 갖고 있는 Graph에 대해서 알아보기 위해서, 아주 간단한 그래프를 그려볼 것입니다.
간단한 3개의 노드를 이용해서 그래프를 그려볼 수 있습니다.

## 패키지 설치

```
%%capture --no-stderr
%pip install --quiet -U langgraph
```

## State (상태저장)

우선, 그래프의 상태를 저장하는 State class를 우선 정의합니다.
이 상태 스키마는 그래프의 모든 노드에 대한 정보들을 저장하고 처리합니다.

정형화된 데이터 저장을 위해서, 이번 예시에서는 `TypedDict` 클래스를 이용해서 State를 생성합니다.

```
from typing_extensions import TypedDict

class State(TypedDict):
    graph_state: str
```

## 노드

그래프에서 각각이 의미있는 수행포인트를 지정하는 것이 노드입니다.

각각의 노드들은 그래프의 현재 상태를 알고 판단을 수행해야 하기 때문에, 위에서 정의한 state 클래스를 입력 아규먼트로 사용합니다.

위에서 State를 정의할 때, graph_state에 대한 멤버변수를 정의했기 때문에, 각 노드에서는 state 클래스의 멤버변수를 접근하여 활용할 수 있습니다.

그리고 각 노드는 처리된 결과를 리턴합니다.

이 예제에서는 각 노드에서 이전 state에 저장된 정보를 계속해서 업데이트하면서 결과가 어떻게 바뀌는지를 확인할 수 있습니다.

```
def node_1(state):
    print("---Node 1---")
    return {"graph_state": state['graph_state'] +" I am"}

def node_2(state):
    print("---Node 2---")
    return {"graph_state": state['graph_state'] +" happy!"}

def node_3(state):
    print("---Node 3---")
    return {"graph_state": state['graph_state'] +" sad!"}
```

## 엣지

노드가 각 역할을 수행하는 점들이라고 한다면, 엣지를 각 점들을 연결하는 역할을 수행합니다.

이 방식을 통해서, 각 노드들을 연결하면서, 전체적인 Workflow 그래프를 완성합니다.

기본적인 엣지의 형태는 노드1에서 노드2로 연결하는 역할만 수행합니다.

조건분기 엣지는 입력되는 결과에 따라서 다음에 수행해야 하는 노드를 선택하는 조건을 분기하는 로직을 넣어서 처리하는 역할을 수행합니다. 그래서 분기할 수 있는 로직을 넣어서 처리합니다.

```
import random
from typing import Literal

def decide_mood(state) -> Literal["node_2", "node_3"]:
    
    # Often, we will use state to decide on the next node to visit
    user_input = state['graph_state'] 
    
    # Here, let's just do a 50 / 50 split between nodes 2, 3
    if random.random() < 0.5:

        # 50% of the time, we return Node 2
        return "node_2"
    
    # 50% of the time, we return Node 3
    return "node_3"
```

## 그래프 구성

이전 과정까지, 노드와 엣지에 대해서 설명했으니, 그래프를 이제 그릴 수 있습니다.

우선, StateGraph를 초기화하여 생성합니다.
 
그리고, 노드와 엣지를 추가합니다.

그래프를 시작할 때는 `START`라는 특수 노드를 우선 정의해야 합니다.
이 노드이 있어야 그래프가 시작할 수 있습니다.

마찬가지로, `END`라는 특수 노드를 정의해야 합니다.
이 노드를 통해서 그래프의 최종 상태를 정의할 수 있습니다.

마지막으로 이렇게 정의된 내용들을 `compile`하면 그래프가 완성됩니다.

그리고 이렇게 만들어진 그래프를 Mermain diagram 기능을 이용해서 그래프를 png 파일로 visualize 할 수 있습니다.
이렇게 Visualization 방식을 통해서 그래프를 빠르게 이해할 수 있습니다.

```
def dummy_func(state) -> Literal["node_2", "node_3"]:
    
    # Often, we will use state to decide on the next node to visit
    user_input = state['graph_state']

    return "node_2"
```

```
from IPython.display import Image, display
from langgraph.graph import StateGraph, START, END

# Build graph
builder = StateGraph(State)
builder.add_node("node_1", node_1)
builder.add_node("node_2", node_2)
builder.add_node("node_3", node_3)
builder.add_edge(START, "node_1")
builder.add_conditional_edges("node_1", dummy_func)
builder.add_edge("node_2", END)
builder.add_edge("node_3", END)

# Add
graph = builder.compile()

# View
display(Image(graph.get_graph().draw_mermaid_png()))
```
![langgraph1](/assets/images/post_img/langgraph1.png)

```
from IPython.display import Image, display
from langgraph.graph import StateGraph, START, END


# Build graph
builder = StateGraph(State)
builder.add_node("node_1", node_1)
builder.add_node("node_2", node_2)
builder.add_node("node_3", node_3)

# Logic
builder.add_edge(START, "node_1")
builder.add_conditional_edges("node_1", decide_mood)
builder.add_edge("node_2", END)
builder.add_edge("node_3", END)

# Add
graph = builder.compile()

# View
display(Image(graph.get_graph().draw_mermaid_png()))
```

## 그래프 호출

The compiled graph implements the [runnable](https://python.langchain.com/v0.1/docs/expression_language/interface/) protocol.
이렇게 컴파일된 그래프는 LangChain의 `runnable`로 동작합니다.

이 방식은 LangChain 콤포넌트들을 효과적으로 처리합니다.
 
`invoke`는 이러한 `runnable` 동작 아키텍처의 기본적인 호출 방식입니다.

여기에서 처음 수행해 보는 예시는 `{"graph_state": "Hi, this is lance."}`형태로 아주 간단한 메세지를 전달하는 것입니다. 그래프의 상태를 dict 형태로 정의했기 때문에, dict 형태의 메세지로 만들어서 호출합니다. 이 메세지를 인풋값으로 초기에 호출합니다.

이 `invoke`가 그래프를 통해서 호출되면, 그래프는 `START` 노드에서부터 진행을 시작합니다.

그러면 각 노드들은 차례대로 진행합니다.

조건분기 엣지에서는 랜덤 로직을 구현하였습니다. 그래서 노드2와 노드3를 50%의 확률로 번갈아가면서 호출합니다.

각 노드 함수는 현재 상태를 수신하니다. 그리고 처리된 결과를 graph state 클래스에 업데이트합니다.

이 수행은 `END`노드에 다달을 때까지 지속합니다.

```
graph.invoke({"graph_state" : "Hi, this is Lance."})
```

```
---Node 1---
---Node 3---
{'graph_state': 'Hi, this is Lance. I am sad!'}
```

`invoke` 는 그래프에서 동기방식으로 동작합니다.

그래서, 이전 단계가 완전히 끝나기를 기다렸다가 수행합니다.

모든 노드의 수행이 끝나면 마지막 graph state 값을 출력합니다.

이 예시에서는 노드2나 노드3이 완전히 끝나고 나서 결과를 출력합니다. 아래와 같은 결과가 출력됩니다.

```
{'graph_state': 'Hi, this is Lance. I am sad!'}
```