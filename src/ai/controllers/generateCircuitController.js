const { getGroqClient, GROQ_DEFAULTS } = require("../config/groq");
function synthesizeCircuitFromTruthTable(inputs = [], outputs = [], truthTable = []) {
  if (!inputs.length || !outputs.length || !truthTable.length) return null;
  const gates = [], wires = [];
  let gateIdCounter = 0, wireIdCounter = 0;
  const inputGatesMap = {};

  inputs.forEach((name, idx) => {
    const gate = {
      id: gateIdCounter++,
      type: "INPUT",
      x: 80,
      y: 80 + idx * 100,
      label: name,
      inputs: 0,
      hasOutput: true,
      output: null,
      inputValues: [false],
    };
    gates.push(gate);
    inputGatesMap[name] = gate;
  });

  function addWire(fromId, toId, toIndex = 0) {
    wires.push({ id: wireIdCounter++, fromId, toId, toIndex });
  }

  const colX = 300;
  outputs.forEach((outName, outIdx) => {
    const mintermRows = truthTable.filter((row) => row[outName] === 1);

    if (mintermRows.length === 0) {
      const outGate = {
        id: gateIdCounter++,
        type: "OUTPUT",
        x: colX + 400,
        y: 80 + outIdx * 160,
        label: outName,
        inputs: 1,
        hasOutput: false,
        output: null,
        inputValues: [],
      };
      gates.push(outGate);
      return;
    }

    const notGatesMap = {};
    const mintermGateIds = [];

    mintermRows.forEach((row, mIdx) => {
      const termInputs = [];
      inputs.forEach((inpName) => {
        const val = row[inpName];
        if (val === 0) {
          if (!notGatesMap[inpName]) {
            const notGate = {
              id: gateIdCounter++,
              type: "NOT",
              x: colX,
              y: 80 + Object.keys(notGatesMap).length * 80,
              label: `NOT_${inpName}`,
              inputs: 1,
              hasOutput: true,
              output: null,
              inputValues: [],
            };
            gates.push(notGate);
            addWire(inputGatesMap[inpName].id, notGate.id, 0);
            notGatesMap[inpName] = notGate.id;
          }
          termInputs.push(notGatesMap[inpName]);
        } else {
          termInputs.push(inputGatesMap[inpName].id);
        }
      });

      if (termInputs.length === 1) {
        mintermGateIds.push(termInputs[0]);
      } else if (termInputs.length === 2) {
        const andGate = {
          id: gateIdCounter++,
          type: "AND",
          x: colX + 180,
          y: 80 + outIdx * 200 + mIdx * 90,
          label: `AND_${outName}_${mIdx}`,
          inputs: 2,
          hasOutput: true,
          output: null,
          inputValues: [],
        };
        gates.push(andGate);
        addWire(termInputs[0], andGate.id, 0);
        addWire(termInputs[1], andGate.id, 1);
        mintermGateIds.push(andGate.id);
      } else {
        let currAndId = termInputs[0];
        for (let k = 1; k < termInputs.length; k++) {
          const andGate = {
            id: gateIdCounter++,
            type: "AND",
            x: colX + 180 + (k - 1) * 140,
            y: 80 + outIdx * 200 + mIdx * 90,
            label: `AND_${outName}_${mIdx}_${k}`,
            inputs: 2,
            hasOutput: true,
            output: null,
            inputValues: [],
          };
          gates.push(andGate);
          addWire(currAndId, andGate.id, 0);
          addWire(termInputs[k], andGate.id, 1);
          currAndId = andGate.id;
        }
        mintermGateIds.push(currAndId);
      }
    });

    let finalOutGateId;
    if (mintermGateIds.length === 1) {
      finalOutGateId = mintermGateIds[0];
    } else {
      let currOrId = mintermGateIds[0];
      for (let k = 1; k < mintermGateIds.length; k++) {
        const orGate = {
          id: gateIdCounter++,
          type: "OR",
          x: colX + 480 + (k - 1) * 140,
          y: 80 + outIdx * 180,
          label: `OR_${outName}_${k}`,
          inputs: 2,
          hasOutput: true,
          output: null,
          inputValues: [],
        };
        gates.push(orGate);
        addWire(currOrId, orGate.id, 0);
        addWire(mintermGateIds[k], orGate.id, 1);
        currOrId = orGate.id;
      }
      finalOutGateId = currOrId;
    }

    const outPortGate = {
      id: gateIdCounter++,
      type: "OUTPUT",
      x: colX + 750,
      y: 80 + outIdx * 180,
      label: outName,
      inputs: 1,
      hasOutput: false,
      output: null,
      inputValues: [],
    };
    gates.push(outPortGate);
    addWire(finalOutGateId, outPortGate.id, 0);
  });

  return { gates, wires };
}

/**
 * Handles AI Circuit Generation for Digital Logic.
 * Calls CircuitMind API (/generate then /export with gate_json), with internal Groq fallback.
 */
async function handleGenerateCircuit(req, res) {
  const { prompt = "", problem_title = "", problem_description = "", inputs = [], outputs = [], truthTable = [] } = req.body || {};

  const userPrompt = (prompt || problem_description || problem_title || "make a logic circuit").trim();

  const circuitMindUrl =
    process.env.CIRCUITMIND_API_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://circuit-mind-two.vercel.app"
      : "http://127.0.0.1:8000");
  const apiKey = process.env.CIRCUITMIND_API_KEY;

  // 1. Attempt to call CircuitMind API endpoint (/generate and /export)
  if (circuitMindUrl) {
    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) {
        headers["X-API-Key"] = apiKey;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const genResponse = await fetch(`${circuitMindUrl}/generate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ prompt: userPrompt }),
        signal: controller.signal,
      });

      if (genResponse.ok) {
        const circuitJson = await genResponse.json();

        if (circuitJson && circuitJson.circuit_name !== "Unknown" && Array.isArray(circuitJson.components) && circuitJson.components.length > 0) {
          const exportResponse = await fetch(`${circuitMindUrl}/export`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              circuit_json: circuitJson,
              export_format: "gate_json",
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (exportResponse.ok) {
            const exportData = await exportResponse.json();
            const gateData = exportData.gate_json || {};
            if (Array.isArray(gateData.gates) && gateData.gates.length > 1) {
              return res.status(200).json({
                status: "success",
                circuit_name: circuitJson.circuit_name || "Generated Circuit",
                description: circuitJson.description || "",
                gates: gateData.gates || [],
                wires: gateData.wires || [],
                source: circuitJson.source || "circuitmind-api",
              });
            }
          }
        }
      }
      clearTimeout(timeoutId);
    } catch (err) {
      console.warn("[ai.handleGenerateCircuit] CircuitMind API proxy call failed/timed out, using internal fallback:", err.message);
    }
  }

  // 2. Universal Truth Table Synthesizer for ALL problems with truthTable
  if (Array.isArray(inputs) && inputs.length > 0 && Array.isArray(outputs) && outputs.length > 0 && Array.isArray(truthTable) && truthTable.length > 0) {
    const synthesized = synthesizeCircuitFromTruthTable(inputs, outputs, truthTable);
    if (synthesized && synthesized.gates && synthesized.gates.length > 0) {
      return res.status(200).json({
        status: "success",
        circuit_name: userPrompt,
        description: `Synthesized digital logic circuit for ${problem_title || userPrompt}`,
        gates: synthesized.gates,
        wires: synthesized.wires,
        source: "universal-synthesizer",
      });
    }
  }

  // 3. Fallback: Internal Groq generation
  const groqClient = getGroqClient();
  if (!groqClient) {
    return res.status(503).json({
      error: "AI circuit generation is temporarily unavailable. Please try again shortly.",
    });
  }

  try {
    const systemPrompt =
      "You are a digital logic circuit generator. Convert user requests into a gate JSON graph. " +
      "Reply ONLY with valid JSON containing 'gates' (list of {id, type, x, y, label}) and 'wires' (list of {id, fromId, toId, toIndex}). " +
      "Gate types must be: INPUT, OUTPUT, AND, OR, NOT, XOR, NAND, NOR.";

    const completion = await groqClient.chat.completions.create({
      model: GROQ_DEFAULTS.model,
      max_tokens: 600,
      temperature: 0.2,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Generate logic circuit for: "${userPrompt}"` },
      ],
    });

    let cleanJson = (completion?.choices?.[0]?.message?.content || "").trim();
    if (cleanJson.startsWith("```")) {
      const parts = cleanJson.split("```");
      cleanJson = parts[1] ? parts[1].replace(/^json/, "").trim() : cleanJson;
    }

    const parsed = JSON.parse(cleanJson);
    return res.status(200).json({
      status: "success",
      circuit_name: userPrompt,
      gates: parsed.gates || [],
      wires: parsed.wires || [],
      source: "groq-fallback",
    });
  } catch (err) {
    console.error("[ai.handleGenerateCircuit] Fallback generation failed:", err?.message || err);
    return res.status(503).json({
      error: "Could not generate circuit right now. Please try again shortly.",
    });
  }
}

module.exports = { handleGenerateCircuit };
