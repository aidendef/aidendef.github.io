---

title: "Agentic_Workflow_using_LangGraph_and_Bedrock(7)"
date: 2025-05-27 00:07:00 +0900
categories: [tech, ai, cloud]
tags: [AWS, Agentic, LangGraph, Bedrock]
sidebar:
  nav: "docs"
toc: true
toc_sticky: true
# classes: wide
excerpt : Human in the Loop 변경을 알아보자
header:
  teaser: /assets/images/post_img/langgraph7.png
---

## Human in the Loop 변경
중단점이 사용자 승인을 지원하는 방법을 보여드렸지만 그래프가 중단된 후 그래프 상태를 수정하는 방법에 대해서는 아직 설명드리지 않았습니다.

이제 그래프 상태를 직접 편집하고 사람의 피드백을 입력하는 방법을 보여드리겠습니다.

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
## 상태 수정 

이전에는 중단점을 도입했습니다.

그래프를 중단하고 다음 노드를 실행하기 전에 사용자의 승인을 기다리는 데 사용했습니다.

하지만 중단점은 그래프 상태를 수정할 수 있는 기회이기도 합니다.

어시스턴트 노드 앞에 중단점이 있는 에이전트를 설정해 보겠습니다.

## 툴 선언

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

## 그래프 생성

```
from IPython.display import Image, display

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import MessagesState
from langgraph.graph import START, StateGraph
from langgraph.prebuilt import tools_condition, ToolNode

from langchain_core.messages import HumanMessage, SystemMessage

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
graph = builder.compile(interrupt_before=["assistant"], checkpointer=memory)

# Show
display(Image(graph.get_graph(xray=True).draw_mermaid_png()))
```

![langgraph7](/assets/images/post_img/langgraph7.png)

수행해 봅시다.

채팅 모델이 응답하기 전에 그래프가 중단된 것을 볼 수 있습니다.

```
# Input
initial_input = {"messages": "Multiply 2 and 3"}

# Thread
thread = {"configurable": {"thread_id": "1"}}

# Run the graph until the first interruption
for event in graph.stream(initial_input, thread, stream_mode="values"):
    event['messages'][-1].pretty_print()
```

```
================================ Human Message =================================

Multiply 2 and 3
```
```
state = graph.get_state(thread)
state.next
```
```
('assistant',)
```

이제 상태 업데이트를 직접 적용할 수 있습니다.

메시지 키에 대한 업데이트는 add_messages 리듀서를 사용할 수 있습니다.

* 기존 메시지를 덮어쓰려면 메시지 ID를 제공하면 됩니다.
* 단순히 메시지 목록에 추가하려는 경우 아래와 같이 ID를 지정하지 않고 메시지를 전달할 수 있습니다.

```
graph.update_state(
    thread,
    {"messages": [HumanMessage(content="No, actually multiply 3 and 3!")]},
)
```
```

================================ Human Message =================================

Multiply 2 and 3
('assistant',)
{'configurable': {'thread_id': '1',
  'checkpoint_ns': '',
  'checkpoint_id': '1eff2610-691e-624f-8001-9d5f35e0e8e0'}}
```

한 번 살펴봅시다.

update_state를 호출하여 새메세지로 업데이트하였습니다.

add_messages 리듀서는 이를 상태 키인 메시지에 추가합니다.

```
new_state = graph.get_state(thread).values
for m in new_state['messages']:
    m.pretty_print()
```

```
================================ Human Message =================================

Multiply 2 and 3
================================ Human Message =================================

No, actually multiply 3 and 3!
```

이제 에이전트에 None을 전달하고 현재 상태에서 진행하도록 허용하여 진행하겠습니다.

```
for event in graph.stream(None, thread, stream_mode="values"):
    event['messages'][-1].pretty_print()
```
```
================================ Human Message =================================

No, actually multiply 3 and 3!
================================== Ai Message ==================================

[{'type': 'text', 'text': "Okay, let's multiply 3 and 3:"}, {'type': 'tool_use', 'name': 'multiply', 'input': {'a': 3, 'b': 3}, 'id': 'tooluse_a-AWT-oiRv27JR1vq-enDQ'}]
Tool Calls:
  multiply (tooluse_a-AWT-oiRv27JR1vq-enDQ)
 Call ID: tooluse_a-AWT-oiRv27JR1vq-enDQ
  Args:
    a: 3
    b: 3
================================= Tool Message =================================
Name: multiply

9
```

```
state = graph.get_state(thread)
state.next
```
```
('assistant',)
```

이제 중단점이 있는 어시스턴트로 돌아왔습니다.

다시 None을 전달하여 계속 진행하면 됩니다.

```
for event in graph.stream(None, thread, stream_mode="values"):
    event['messages'][-1].pretty_print()
```
```
================================= Tool Message =================================
Name: multiply

9
================================== Ai Message ==================================

The result of multiplying 3 and 3 is 9.
```
```
state = graph.get_state(thread)
state.next
```
```
()
```