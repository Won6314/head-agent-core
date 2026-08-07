# How to Load Only the Task Instructions You Need

[Contents](README.md) · [한국어](ko/01-instructions-on-demand.md)

## Instructions Are Context Too

Task instructions are not optional for an LLM. They determine what it should do, which standards it must uphold, and how far it can make decisions.

The problem arises when instructions multiply. If instructions for development, research, design, deployment, databases, and communication are all placed in one prompt, the model receives rules unrelated to the current task every time as well.

```text
Main instructions
+ development instructions
+ research instructions
+ design instructions
+ deployment instructions
+ database instructions
+ every other instruction
```

This approach seems simple at first. But as features and types of work grow, instructions keep getting longer. Rules written for different situations compete in the same space, and one sentence that matters now is buried among countless exceptions.

Adding more instructions is not always safer or more accurate. Irrelevant instructions are another piece of context the model must interpret.

## One Main Instruction Set and Several Task Instructions

The alternative is not to summarize every instruction more briefly and put them in one place. It is to divide instructions by role.

```text
Main instructions
+ a small instruction index
+ detailed instructions needed for the current task
```

Keep only principles that do not change across different tasks in the main instructions.

- Understand the overall outcome first.
- Do not arbitrarily change important decisions owned by the user.
- Bring only context that can change the current result.
- Confirm the actual result and its evidence.
- Choose the procedures needed for the type of task.

Separate content that is needed only in particular situations into task-specific instructions.

- What to verify when changing software
- Procedures for making and carrying out a long-term plan
- What to verify before and after deployment
- How to use a particular tool or external service
- How to delegate one outcome to another worker

This keeps the main instructions small and stable, while detailed instructions enter the context only when needed.

## Indexing Is Also Noise, but Much Smaller

To find the instructions that are needed, an index is required to show which instructions exist. The index also occupies context, so it is not cost-free.

But the size of the two costs differs.

```text
The cost of always including the full text of every instruction
≫
The cost of showing only which instruction to load when
```

The index needs relationships, not detailed procedures.

```text
Software change       → development task instructions
Single-outcome delegation → single-delegation instructions
Long-running work     → planning and Run instructions
Deployment            → deployment instructions
```

Once the current request is identified as a type of task, load only the connected instructions. This structure accepts the small noise introduced by indexing in exchange for removing the much larger noise of always bringing in all unrelated knowledge.

## Finding Instructions Is Different from Following Them

The index only finds which instructions are relevant. The current contents of the selected instructions determine actual behavior.

This distinction is needed because the index can become old. A connection may be wrong or an instruction may have moved. Therefore, the index is a discovery path, and the selected current instruction is the basis for actual work.

```text
Request
  ↓
Identify task type
  ↓
Find related instructions
  ↓
Confirm current instructions
  ↓
Perform the task
```

## A Form Seen in HEAD Core

HEAD Core does not place every detailed procedure in one giant instruction set.

`HEAD_CORE.md` provides common principles about the overall outcome, authority, context, execution approach, and evidence. Specific procedures, such as changing software, delegating a single outcome, long-term planning, and Run execution, are separated into their respective Skills.

```text
HEAD Core
= common principles + task-type judgment + instruction routing

Skills
= detailed procedures needed only for the current task
```

For example, a request to change software behavior loads instructions that shape development work, while assigning one independent outcome loads the single-delegation instructions. Procedures unrelated to either task do not need to enter the current context.

The purpose of this structure is not to hide instructions. It is to make the needed instructions visible more precisely.

## How Far Should Instructions Be Divided?

If every sentence is separated into its own instruction, discovery costs increase instead. The following criteria are useful.

- Put principles always needed across many tasks in the main instructions.
- Separate procedures needed only for a particular task type.
- Keep small instructions frequently used together as one.
- Do not divide them so finely that the selection criteria become difficult to explain.

What matters is not the number of files, but the density of the context entering the current task.

## Conclusion

Refining task instructions does not mean compressing every instruction briefly into one prompt.

> Keep only common principles and the discovery method in one main instruction set, and load detailed instructions according to their relationship to the current task.

What is needed after instructions is material for understanding the problem. The next article looks at [how to refine documents and search results through a graph](02-graph-research-context.md).
