---

title: "Agentic_Workflow_using_LangGraph_and_Bedrock(4)"
date: 2025-05-27 00:04:00 +0900
categories: [tech, ai, cloud]
tags: [AWS, Agentic, LangGraph, Bedrock]
sidebar:
  nav: "docs"
toc: true
toc_sticky: true
# classes: wide
excerpt : 그래프 메모리를 알아보자
header:
  teaser: /assets/images/post_img/langgraph4.png
---


## 그래프 메모리란?
Agent를 통해서 처리되는 것들을 살펴 보았습니다.
하지만, LLM은 기본적으로 사용자가 수행하는 대화를 기억하지 못합니다.
그래서 그래프에서도 사용자가 수행하는 대화를 기억할 수 있도록 하는 장치가 필요합니다.
그래서 그래프 메모리는 이렇게 사용자가 수행한 대화를 기억할 수 있도록 도와서 컨텍스트에 맞는 답변을 하도록 도움을 줍니다.

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
## 툴 생성
이전 실습과 동일하게 아래와 같은 툴들을 생성합니다.

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
    """Divide a and b.

    Args:
        a: first int
        b: second int
    """
    return a / b

tools = [add, multiply, divide]
llm_with_tools = llm.bind_tools(tools)
```

## Assistant 함수 정의

```
from langgraph.graph import MessagesState
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

# System message
sys_msg = SystemMessage(content="You are a helpful assistant tasked with performing arithmetic on a set of inputs.")

# Node
def assistant(state: MessagesState):
   return {"messages": [llm_with_tools.invoke([sys_msg] + state["messages"])]}
```

## 그래프 생성
```
from langgraph.graph import START, StateGraph
from langgraph.prebuilt import tools_condition, ToolNode
from IPython.display import Image, display

# Graph
builder = StateGraph(MessagesState)

# Define nodes: these do the work
builder.add_node("assistant", assistant)
builder.add_node("tools", ToolNode(tools))

# Define edges: these determine how the control flow moves
builder.add_edge(START, "assistant")
builder.add_conditional_edges(
    "assistant",
    # If the latest message (result) from assistant is a tool call -> tools_condition routes to tools
    # If the latest message (result) from assistant is a not a tool call -> tools_condition routes to END
    tools_condition,
)
builder.add_edge("tools", "assistant")
react_graph = builder.compile()

# Show
display(Image(react_graph.get_graph(xray=True).draw_mermaid_png()))
```
![langgraph4](/assets/images/post_img/langgraph4.png)

# 메모리 관련 수행 테스트

생성된 그래프 에이전트를 아래와 같이 수행합니다.

```
messages = [HumanMessage(content="Add 3 and 4.")]
messages = react_graph.invoke({"messages": messages})
for m in messages['messages']:
    m.pretty_print()
```

```
================================ Human Message =================================

Add 3 and 4.
================================== Ai Message ==================================

[{'type': 'tool_use', 'name': 'add', 'input': {'a': 3, 'b': 4}, 'id': 'tooluse_H7NSwbEZTly89MQ_60KYfg'}]
Tool Calls:
  add (tooluse_H7NSwbEZTly89MQ_60KYfg)
 Call ID: tooluse_H7NSwbEZTly89MQ_60KYfg
  Args:
    a: 3
    b: 4
================================= Tool Message =================================
Name: add

7
================================== Ai Message ==================================

The result of adding 3 and 4 is 7.
```

## 메모리 없이 수행 테스트테스트 
이 상태에서 앞의 결과를 참조해서 아래와 같이 질문합니다.
```
messages = [HumanMessage(content="Multiply that by 2.")]
messages = react_graph.invoke({"messages": messages})
for m in messages['messages']:
    m.pretty_print()
```

```
================================ Human Message =================================

Multiply that by 2.
================================== Ai Message ==================================

[{'type': 'text', 'text': "Okay, let's multiply the previous result by 2."}, {'type': 'tool_use', 'name': 'multiply', 'input': {'a': '$PREVIOUS_RESULT', 'b': 2}, 'id': 'tooluse_P1TkD006QBSvvAITldWUyg'}]
Tool Calls:
  multiply (tooluse_P1TkD006QBSvvAITldWUyg)
 Call ID: tooluse_P1TkD006QBSvvAITldWUyg
  Args:
    a: $PREVIOUS_RESULT
    b: 2
================================= Tool Message =================================
Name: multiply

Error: 1 validation error for multiply
a
  Input should be a valid integer, unable to parse string as an integer [type=int_parsing, input_value='$PREVIOUS_RESULT', input_type=str]
    For further information visit https://errors.pydantic.dev/2.9/v/int_parsing
 Please fix your mistakes.
================================== Ai Message ==================================

Oops, it looks like I don't have a previous result stored. Could you please provide the number you would like me to multiply by 2?
```

## 메모리를 활용한 수행 테스트
에이전트는 이전 결과값을 알 지 못해서 위의 결과와 같이 계산을 할 수 없다고 답변합니다.

그 이유는 LLM은 사용자의 대화를 기억하지 못하기 때문입니다.

그래서, 이런 방식으로 그대로 수행하게 되면, 멀티턴을 이용하는 대화방식을 구현이 쉽지 않습니다.

그래서, 여기에서 우리는 `persistence` 아키텍처를 이용할 수 있습니다.

LangGraph에서는 `checkpointer`라는 개념을 이용해서, 그래프의 상태를 저장하도록 할 수 있습니다.

LangGraph에서 자체 지원하는 persistence 레이어는 memory로 구성하는 것을 지원합니다. 이를 통해서 마지막 대화나, 진행 상태에 대해서 정보를 참조할 수 있습니다.

가장 쉽게 구현할 수 있는 `Checkpointer`는 `MemorySaver`입니다. `MemorySaver`는 그래프 상태를 저장할 수 있는 key-value 스토업니다.

이를 구현하는 방법은 간단합니다.
그래프르 컴파일할 때, checkpointer 아규먼트와 함께 컴파일하면 됩니다. 그러면, 그래프는 메모리를 갖게 됩니다.

```
from langgraph.checkpoint.memory import MemorySaver
memory = MemorySaver()
react_graph_memory = builder.compile(checkpointer=memory)
```

실제로 대화가 이루어질 때는 어려사용자들이 동시에 사용하게 됩니다.
그래서 사용자는 세션을 구분하기위한 장치가 필요합니다.
그래서, 그래프에서 메모리를 사용할 때는 `thread_id` 아규먼트를 이용해서 세션을 구분하도록 합니다.

This `thread_id` will store our collection of graph states.
이 `thread_id`를 통해서 그래프 상태를 저장할 수 있습니다.

```
# Specify a thread
config = {"configurable": {"thread_id": "1"}}

# Specify an input
messages = [HumanMessage(content="Add 3 and 4.")]

# Run
messages = react_graph_memory.invoke({"messages": messages},config)
for m in messages['messages']:
    m.pretty_print()
```
```
================================ Human Message =================================

Add 3 and 4.
================================== Ai Message ==================================

[{'type': 'tool_use', 'name': 'add', 'input': {'a': 3, 'b': 4}, 'id': 'tooluse_p4Z-a9woSemlo7TWzNaH5Q'}]
Tool Calls:
  add (tooluse_p4Z-a9woSemlo7TWzNaH5Q)
 Call ID: tooluse_p4Z-a9woSemlo7TWzNaH5Q
  Args:
    a: 3
    b: 4
================================= Tool Message =================================
Name: add

7
================================== Ai Message ==================================

The result of adding 3 and 4 is 7.
```
위에서 수행한 결과에 대해서 `thread_id`를 통해서 메모리 처리가 잘 되는지를 확인해 볼 수 있습니다.
`thread_id`를 통해서 이전에 수행한 결과를 참조해 볼 수 있습니다.

이 예시에서 볼 수 있듯이, 이전에 수행한 대화를 참조할 수 있습니다.

`HumanMessage`에 `"Multiply that by 2."`라는 메세지를 수행하면, 이전 대화의 내용에 append 되어 저장됩니다.

그래서 이제 모델은 `that`이라는 지시어가 이전에 문의한 질문에 대한 답변인 `The sum of 3 and 4 is 7.` 임을 알게됩니다.

```
messages = [HumanMessage(content="Multiply that by 2.")]
messages = react_graph_memory.invoke({"messages": messages}, config)
for m in messages['messages']:
    m.pretty_print()
```

```
================================ Human Message =================================

Add 3 and 4.
================================== Ai Message ==================================

[{'type': 'tool_use', 'name': 'add', 'input': {'a': 3, 'b': 4}, 'id': 'tooluse_p4Z-a9woSemlo7TWzNaH5Q'}]
Tool Calls:
  add (tooluse_p4Z-a9woSemlo7TWzNaH5Q)
 Call ID: tooluse_p4Z-a9woSemlo7TWzNaH5Q
  Args:
    a: 3
    b: 4
================================= Tool Message =================================
Name: add

7
================================== Ai Message ==================================

The result of adding 3 and 4 is 7.
================================ Human Message =================================

Multiply that by 2.
================================== Ai Message ==================================

[{'type': 'tool_use', 'name': 'multiply', 'input': {'a': 7, 'b': 2}, 'id': 'tooluse_QPBCvXWOQwGLCH4mudVp7Q'}]
...
14
================================== Ai Message ==================================

The result of multiplying 7 by 2 is 14.
```