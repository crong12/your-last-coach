# Coaching

The domain of a single athlete and a Coach Agent working through shared training context to prepare for a Target Race.

## Language

**Athlete**:
The recreational runner whose preparation for a Target Race is managed through the Shared Coaching Workspace.
_Avoid_: User, client

**Target Race**:
The upcoming race whose date, distance, and performance objective orient the Training Plan.
_Avoid_: Goal event

**Coach Agent**:
An agent that exercises running-coaching judgment from shared training context and collaborates with the Athlete.
_Avoid_: Chatbot, assistant, AI coach

**Shared Coaching Workspace**:
The web interface that gives the Athlete and Coach Agent common context and a common place to inspect and change the Training Plan.
_Avoid_: Dashboard, portal

**Athlete Profile**:
Slow-changing facts, abilities, preferences, and recurring constraints that materially affect coaching for one Athlete.
_Avoid_: User profile, biography, memory

**Coaching Evidence**:
Time-stamped, provenance-labelled observations and Athlete reports that can support or challenge a Coach Recommendation.
_Avoid_: Data dump, context blob

**Coaching Topic**:
An ongoing matter that may need relevant follow-up across workouts or conversations, with its current status grounded in Coaching Evidence.
_Avoid_: Memory, note, diagnosis

**Coaching Briefing**:
A bounded, current selection of Athlete Profile, Coaching Evidence, active Coaching Topics, Training Plan state, and Adaptation History prepared for one coaching interaction.
_Avoid_: Full history, prompt, memory dump

**Training Plan**:
The mutable schedule of Planned Workouts organized to prepare the Athlete for the Target Race.
_Avoid_: Programme, calendar

**Training Phase**:
The current period of the Training Plan characterized by a primary physiological emphasis, such as base building or aerobic development.
_Avoid_: Macrocycle

**Planned Workout**:
A prescribed training session with a scheduled time, purpose, and workout structure.
_Avoid_: Activity

**Workout Result**:
The recorded objective outcome of an Athlete performing a planned or unplanned workout.
_Avoid_: Completed workout, activity

**Athlete Feedback**:
The Athlete's subjective report about their experience of training, including perceived effort, fatigue, pain, confidence, and relevant life context.
_Avoid_: Notes, comments

**Coach Recommendation**:
The Coach Agent's prescriptive judgment about the best available course of action, accompanied by its rationale and uncertainty.
_Avoid_: Suggestion, option

**Plan Adaptation**:
A proposed or approved change to the Training Plan in response to Workout Results, Athlete Feedback, or other shared context.
_Avoid_: Edit, tweak

**Workout Adaptation**:
A Plan Adaptation that changes one Planned Workout or a small group of nearby Planned Workouts.
_Avoid_: Workout edit

**Phase Transition**:
A Plan Adaptation that changes the Training Phase and the Training Plan's emphasis across a longer period.
_Avoid_: Phase change

**Plan Approval**:
The Athlete's consent that authorizes a proposed Plan Adaptation to become part of the Training Plan.
_Avoid_: Confirmation

**Adaptation History**:
Immutable receipts for approved Plan Adaptations: evidence references, selected option identity, affected before-and-after values, application time, and Training Plan versions.
_Avoid_: Chat history, audit log, Agent memory

## Relationships

- One **Athlete** has one current **Athlete Profile** and one **Training Plan** for a **Target Race**.
- **Coaching Evidence** may come from a **Workout Result** or **Athlete Feedback**.
- A **Coaching Topic** references one or more pieces of **Coaching Evidence** and remains active until new evidence supports a status change.
- A **Coaching Briefing** selects only the context relevant to the current coaching interaction; it does not replace the underlying records.
- A **Coach Recommendation** cites **Coaching Evidence** and may propose one or more **Plan Adaptations**.
- **Plan Approval** applies one proposed **Plan Adaptation** and adds its outcome to **Adaptation History**.

## Example dialogue

> **Athlete:** “I finished today's run without pain, but my legs felt unusually heavy.”
>
> **Coach Agent:** “That adds new **Athlete Feedback** beside the stable shin-discomfort **Coaching Topic**. Your **Coaching Briefing** also shows elevated recent load, so I recommend reviewing the rest of this week before changing the **Training Plan**.”

## Flagged ambiguities

- “Context” can mean every stored record or the information needed now. Use **Coaching Briefing** for the bounded current selection and the specific domain term for each underlying record.
- “Memory” is not a domain object. Use **Athlete Profile**, **Coaching Topic**, or **Adaptation History** according to what must persist.
