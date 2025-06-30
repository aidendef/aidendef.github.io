---

title: "Agentic_Workflow_using_LangGraph_and_Bedrock(6)"
date: 2025-05-27 00:06:00 +0900
categories: [tech, ai, cloud]
tags: [AWS, Agentic, LangGraph, Bedrock]
sidebar:
  nav: "docs"
toc: true
toc_sticky: true
# classes: wide
excerpt : 휴먼 인 더 루프를 알아보자
header:
  teaser: /assets/images/post_img/langgraph6.png
---


## Human in the Loop



이제 휴먼 인 더 루프가 필요한 배경에 대해 이야기해 보겠습니다:

(1) 승인 - 에이전트를 중단하고 사용자에게 상태를 표시하고 사용자가 작업을 수락하도록 허용할 수 있습니다.

(2) 디버깅 - 그래프를 되감아 문제를 재현하거나 피할 수 있습니다.

(3) 편집 - 상태를 수정할 수 있습니다.

LangGraph는 다양한 휴먼 인 더 루프 워크플로우를 지원하기 위해 에이전트 상태를 가져오거나 업데이트하는 여러 가지 방법을 제공합니다.

먼저 특정 단계에서 그래프를 멈추는 간단한 방법을 제공하는 `breakpoints`를 소개하겠습니다.

이를 통해 어떻게 사용자 승인을 지원하는지 보여드리겠습니다.

## Bedrock setup

```
import os
import getpass
import boto3
from langchain_aws import ChatBedrockConverse
from langchain_aws import ChatBedrock

# ---- ⚠️ Update region for your AWS setup ⚠️ ----
aws_region = os.getenv("AWS_REGION")
bedrock_client = boto3.client("bedrock-runtime", region_name=aws_region)

llm = ChatBedrockConverse(
    model="anthropic.claude-3-haiku-20240307-v1:0",
    temperature=0,
    max_tokens=None,
    client=bedrock_client,
    # other params...
)

llm.invoke("what is the Amazon Nova?")

def _set_env(var: str):
    if not os.environ.get(var):
        os.environ[var] = getpass.getpass(f"{var}: ")

```

## Human 승인을 위한 breakpoint
이전 모듈에서 작업했던 간단한 에이전트를 다시 생각해 보겠습니다.

에이전트가 도구를 사용할 수 있도록 승인하고 싶다고 가정해 보겠습니다.

여기서 `tools` 는 도구 노드입니다. `interrupt_before=["tools"]`로 그래프를 컴파일하기만 하면 됩니다.

이렇게 하면, 도구 호출을 실행하는 도구 노드 전에 실행이 중단됩니다.

## 툴 정의

```
def multiply(a: int, b: int) -> int:
    """Multiply a and b.

    Args:
        a: first int
        b: second int
    """
    return a * b

# This will be a tool
def add(a: int, b: int) -> int:
    """Adds a and b.

    Args:
        a: first int
        b: second int
    """
    return a + b

def divide(a: int, b: int) -> float:
    """Adds a and b.

    Args:
        a: first int
        b: second int
    """
    return a / b

tools = [add, multiply, divide]
llm_with_tools = llm.bind_tools(tools)
```

## 그래프 정의

```
from IPython.display import Image, display

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import MessagesState
from langgraph.graph import START, StateGraph
from langgraph.prebuilt import tools_condition, ToolNode

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

# System message
sys_msg = SystemMessage(content="You are a helpful assistant tasked with performing arithmetic on a set of inputs.")

# Node
def assistant(state: MessagesState):
   return {"messages": [llm_with_tools.invoke([sys_msg] + state["messages"])]}

# Graph
builder = StateGraph(MessagesState)

# Define nodes: these do the work
builder.add_node("assistant", assistant)
builder.add_node("tools", ToolNode(tools))

# Define edges: these determine the control flow
builder.add_edge(START, "assistant")
builder.add_conditional_edges(
    "assistant",
    # If the latest message (result) from assistant is a tool call -> tools_condition routes to tools
    # If the latest message (result) from assistant is a not a tool call -> tools_condition routes to END
    tools_condition,
)
builder.add_edge("tools", "assistant")

memory = MemorySaver()
graph = builder.compile(interrupt_before=["tools"], checkpointer=memory)

# Show
display(Image(graph.get_graph(xray=True).draw_mermaid_png()))
```

![langgraph6](/assets/images/post_img/langgraph6.png)

## 수행 테스트

```
# Input
initial_input = {"messages": HumanMessage(content="Multiply 2 and 3")}

# Thread
thread = {"configurable": {"thread_id": "1"}}

# Run the graph until the first interruption
for event in graph.stream(initial_input, thread, stream_mode="values"):
    event['messages'][-1].pretty_print()
```

```
================================ Human Message =================================

Multiply 2 and 3
================================== Ai Message ==================================

[{'type': 'tool_use', 'name': 'multiply', 'input': {'a': 2, 'b': 3}, 'id': 'tooluse_4-zyUmE8QkyCpyZdpa60FA'}]
Tool Calls:
  multiply (tooluse_4-zyUmE8QkyCpyZdpa60FA)
 Call ID: tooluse_4-zyUmE8QkyCpyZdpa60FA
  Args:
    a: 2
    b: 3
```

상태를 확인하고 다음 호출할 노드를 확인할 수 있습니다.
그래프가 중단된 것을 확인할 수 있는 좋은 방법입니다.

```
state = graph.get_state(thread)
state.next
```
```
('tools',)
```
이제 멋진 트릭을 소개하겠습니다.
`None`으로 그래프를 호출하면 마지막 상태 체크포인트부터 계속됩니다!

명확히 하기 위해 LangGraph는 도구 호출과 함께 `AIMessage`가 포함된 현재 상태를 다시 전송합니다.

그런 다음 그래프에서 도구 노드부터 시작되는 다음 단계를 실행합니다.

이 도구 호출로 도구 노드가 실행되고 최종 답변을 위해 채팅 모델에 다시 전달되는 것을 볼 수 있습니다.

```
for event in graph.stream(None, thread, stream_mode="values"):
    event['messages'][-1].pretty_print()
```
```
================================== Ai Message ==================================

[{'type': 'tool_use', 'name': 'multiply', 'input': {'a': 2, 'b': 3}, 'id': 'tooluse_4-zyUmE8QkyCpyZdpa60FA'}]
Tool Calls:
  multiply (tooluse_4-zyUmE8QkyCpyZdpa60FA)
 Call ID: tooluse_4-zyUmE8QkyCpyZdpa60FA
  Args:
    a: 2
    b: 3
================================= Tool Message =================================
Name: multiply

6
================================== Ai Message ==================================

The result of multiplying 2 and 3 is 6.
```

이제 이를 사용자 입력을 수락하는 구체적인 사용자 승인 단계와 결합해 보겠습니다.

## 사용자 승인
```
# Input
initial_input = {"messages": HumanMessage(content="Multiply 2 and 3")}

# Thread
thread = {"configurable": {"thread_id": "2"}}

# Run the graph until the first interruption
for event in graph.stream(initial_input, thread, stream_mode="values"):
    event['messages'][-1].pretty_print()

# Get user feedback
user_approval = input("Do you want to call the tool? (yes/no): ")

# Check approval
if user_approval.lower() == "yes":
    
    # If approved, continue the graph execution
    for event in graph.stream(None, thread, stream_mode="values"):
        event['messages'][-1].pretty_print()
        
else:
    print("Operation cancelled by user.")
```

```
================================ Human Message =================================

Multiply 2 and 3
================================== Ai Message ==================================

[{'type': 'tool_use', 'name': 'multiply', 'input': {'a': 2, 'b': 3}, 'id': 'tooluse_-sDfPvjsQYyb_oGcepgxbA'}]
Tool Calls:
  multiply (tooluse_-sDfPvjsQYyb_oGcepgxbA)
 Call ID: tooluse_-sDfPvjsQYyb_oGcepgxbA
  Args:
    a: 2
    b: 3
Do you want to call the tool? (yes/no):  yes
================================== Ai Message ==================================

[{'type': 'tool_use', 'name': 'multiply', 'input': {'a': 2, 'b': 3}, 'id': 'tooluse_-sDfPvjsQYyb_oGcepgxbA'}]
Tool Calls:
  multiply (tooluse_-sDfPvjsQYyb_oGcepgxbA)
 Call ID: tooluse_-sDfPvjsQYyb_oGcepgxbA
  Args:
    a: 2
    b: 3
================================= Tool Message =================================
Name: multiply

6
================================== Ai Message ==================================

The result of multiplying 2 and 3 is 6..
```
