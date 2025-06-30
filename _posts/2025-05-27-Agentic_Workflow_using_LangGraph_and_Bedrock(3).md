---

title: "Agentic_Workflow_using_LangGraph_and_Bedrock(3)"
date: 2025-05-27 00:03:00 +0900
categories: [tech, ai, cloud]
tags: [AWS, Agentic, LangGraph, Bedrock]
sidebar:
  nav: "docs"
toc: true
toc_sticky: true
# classes: wide
excerpt : 툴 에이전트를 알아보자
header:
  teaser: /assets/images/post_img/langgraph3.png
---

## 툴 에이전트 실습

앞에서 라우터를 실습해 봤기 때문에, 여기에서는 좀 더 해당 개념을 확장해서 수행할 예정입니다.

우리는 앞의 라우터 실습에서, LLM에게 질의를 하였고, 만약에 질의의 내용이 툴을 호출하는 것이라면, `ToolMessage`를 통해서 답변을 하는 것을 보았습니다.

이번에는, ToolMessage를 바로 사용자에게 답변하는 것이 아니라, 이 메세지를 다시 모델에게 전달할 수 있을까요?

그래서 이번에는 툴을 통해서 나온 답변을 이용해서 또 다른 툴에게 인풋으로 사용하라고 전달하거나, 바로 사용자에게 답변이 가능한지를 실험해 보도록 하겠습니다.

이러한 접근 방식이 기본적인 ReAct에서 수행하는 접근법과 동일한 접근법입니다.
  
* `act` - 모델이 툴을 사용합니다.
* `observe` - 툴의 결과값을 다시 모델에게 전달합니다.
* `reason` - 툴의 결과값에 대해서 다른 툴을 호출해야 되는지 등에 대한 reasoning을 수행합니다.

이 접근법은 다양한 Agent 아키텍처에서 공통으로 활용될 수 있습니다.

## Bedrock Setup
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

## 여러개의 툴들을 정의

아래와 같이, 덧셈, 곱셈, 나눗셈 툴을 정의합니다.
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

LLM assitant를 만들어서 전체적인 agent 동작을 관장하도록 합니다.

```
from langgraph.graph import MessagesState
from langchain_core.messages import HumanMessage, SystemMessage

# System message
sys_msg = SystemMessage(content="You are a helpful assistant tasked with performing arithmetic on a set of inputs.")

# Node
def assistant(state: MessagesState):
   return {"messages": [llm_with_tools.invoke([sys_msg] + state["messages"])]}
```

이전에는 `Tools` 노드를 생성해서 이 노드에서 툴들을 처리하도록 하였습니다.

이번에는 `Assistant` 노드를 만들었고, 이 노드에서 LLM이 명시적으로 동작하도록 세팅하고 있습니다.

마찬가지로 `Assistant`와 `Tools` 노드를 생성합니다.

그리고 `tools_condition` 엣지르를 구성합니다. 이 엣지는 입력되는 요건에 따라서 툴을 사용하게 할 것인지, 바로 답변을 수행해서 `End` 노드로 분기하도록 할지를 결정합니다.

그리고 한가지 단계가 더 있습니다.

`Tools`에 대한 답변을 다시 `Assistant`노드로 전달하도록 루프를 생성합니다. 이 루프는 아래와 같은 방식으로 동작합니다.

* 최초에 `assistant` 노드가 수행된 이후에, `tools_condition`이 툴을 수행할 것인지를 결정합니다.
* Tool call이 결정된다면, `tools`노드가 수행되도록 분기합니다.
* `tools`의 수행결과는 다시 `assistant`노드로 되돌아갑니다.
* 이 루프는 `assistant` 노드에서 툴 호출이 계속적으로 필요하다고 판단된다면, 계속적으로 수행합니다.
* 모델의 결과가 툴 호출이 더 이상 필요하지 않다고 판단된다면, 플로우는 END노드로 넘어갑니다. 이로서 모든 수행이 끝납니다.

## 그래프 생성

```
from langgraph.graph import START, StateGraph
from langgraph.prebuilt import tools_condition
from langgraph.prebuilt import ToolNode
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
![langgraph3](/assets/images/post_img/langgraph3.png)

## 그래프 수행 테스트

```
messages = [HumanMessage(content="Add 3 and 4. Multiply the output by 2. Divide the output by 5")]
messages = react_graph.invoke({"messages": messages})
```

```
for m in messages['messages']:
    m.pretty_print()
```

```
================================ Human Message =================================

Add 3 and 4. Multiply the output by 2. Divide the output by 5
================================== Ai Message ==================================

[{'type': 'text', 'text': "Okay, let's do that step-by-step:"}, {'type': 'tool_use', 'name': 'add', 'input': {'a': 3, 'b': 4}, 'id': 'tooluse_u8LY5iziQtu7L-LLq_AlRw'}]
Tool Calls:
  add (tooluse_u8LY5iziQtu7L-LLq_AlRw)
 Call ID: tooluse_u8LY5iziQtu7L-LLq_AlRw
  Args:
    a: 3
    b: 4
================================= Tool Message =================================
Name: add

7
================================== Ai Message ==================================

[{'type': 'tool_use', 'name': 'multiply', 'input': {'a': 7, 'b': 2}, 'id': 'tooluse_gxPpRu89TfWwIfjF2fQAQw'}]
Tool Calls:
  multiply (tooluse_gxPpRu89TfWwIfjF2fQAQw)
 Call ID: tooluse_gxPpRu89TfWwIfjF2fQAQw
  Args:
    a: 7
    b: 2
...
2.8
================================== Ai Message ==================================

So the final result is 2.8.
```


