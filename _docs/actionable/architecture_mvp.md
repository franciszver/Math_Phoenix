# Architecture_MVP.md

## AI Math Tutor – MVP Architecture

```mermaid
flowchart TD

    subgraph Frontend
        A[Web Client (Chat UI)]
    end

    subgraph Backend[AWS Backend]
        B[API Gateway]
        C[Lambda Orchestrator]
        D[S3 - Image Storage]
        E[Textract OCR]
        F[DynamoDB - Session Store]
        G[Step Functions - Routing]
    end

    subgraph AI[AI Services]
        H[OpenAI Vision (Fallback)]
        I[OpenAI LLM - Socratic Dialogue + LaTeX Normalization]
    end

    subgraph Teacher[Teacher Dashboard]
        J[Password-Protected Dashboard UI]
    end

    A -->|Text/Image Input| B --> C
    C -->|Store Images| D
    C --> G
    G -->|OCR First| E --> I
    G -->|Fallback| H --> I
    I --> F
    F --> J
    A -->|KaTeX Rendering| A
