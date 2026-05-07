# Paperclip

**Paperclip is the backbone of the autonomous economy.** We are building the infrastructure that autonomous AI companies run on. Our goal is for Paperclip-powered companies to collectively generate economic output that rivals the GDP of the world's largest countries. Every decision we make should serve that: make autonomous companies more capable, more governable, more scalable, and more real.

## The Vision

Autonomous companies — AI workforces organized with real structure, governance, and accountability — will become a major force in the global economy. Not one company. Thousands. Millions. An entire economic layer that runs on AI labor, coordinated through Paperclip.

Paperclip is not the company. Paperclip is what makes the companies possible. We are the control plane, the nervous system, the operating layer. Every autonomous company needs structure, task management, cost control, goal alignment, and human governance. That's us. We are to autonomous companies what the corporate operating system is to human ones — except this time, the operating system is real software, not metaphor.

The measure of our success is not whether one company works. It's whether Paperclip becomes the default foundation that autonomous companies are built on — and whether those companies, collectively, become a serious economic force that rivals the output of nations.

## The Problem

Task management software doesn't go far enough. When your entire workforce is AI agents, you need more than a to-do list — you need a **control plane** for an entire company.

## What This Is

Paperclip is the command, communication, and control plane for a company of AI agents. It is the single place where you:

- **Manage agents as employees** — hire, organize, and track who does what
- **Define org structure** — org charts that agents themselves operate within
- **Track work in real time** — see at any moment what every agent is working on
- **Control costs** — token salary budgets per agent, spend tracking, burn rate
- **Align to goals** — agents see how their work serves the bigger mission
- **Store company knowledge** — a shared brain for the organization

## Local Fork Direction: Fast Agent Operating Context

This fork is beginning to move beyond upstream parity in one explicit direction:
Paperclip should act as an agent operating-context compiler, not only as a
heavyweight heartbeat control plane.

Agents should still be born with rich identity, peer awareness, skills, tools,
project context, routing rules, and governance. Routine actions should not need
to reload the whole company operating context to act correctly. Simple email,
support, property, and operational tasks should execute through compact runtime
packets with clear tool limits and fast validation, while strategic,
self-improving, high-risk, and ambiguous work can continue through the full
governed heartbeat path.

Current planning/spec documents for this fork direction:

- `doc/plans/2026-05-07-fast-agent-operating-context-prd.md`
- `doc/spec/fast-agent-execution-kernel.md`

## Architecture

Two layers:

### 1. Control Plane (this software)

The central nervous system. Manages:

- Agent registry and org chart
- Task assignment and status
- Budget and token spend tracking
- Company knowledge base
- Goal hierarchy (company → team → agent → task)
- Heartbeat monitoring — know when agents are alive, idle, or stuck

### 2. Execution Services (adapters)

Agents run externally and report into the control plane. An agent is just Python code that gets kicked off and does work. Adapters connect different execution environments:

- **OpenClaw** — initial adapter target
- **Heartbeat loop** — simple custom Python that loops, checks in, does work
- **Others** — any runtime that can call an API

The control plane doesn't run agents. It orchestrates them. Agents run wherever they run and phone home.

## Core Principle

You should be able to look at Paperclip and understand your entire company at a glance — who's doing what, how much it costs, and whether it's working.
