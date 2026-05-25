const axios = require('axios');
const crypto = require('crypto');

const run = async () => {
    const timestamp = Date.now().toString();
    const payload = JSON.stringify({ prompt: "test", schema_fields: [] });
    const secret = "test-secret";
    
    const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');

    try {
        const res = await axios.post('http://127.0.0.1:8000/ai/query-builder', payload, {
            headers: {
                'X-Internal-Signature': signature,
                'X-Timestamp': timestamp,
                'Content-Type': 'application/json'
            }
        });
        console.log("Success:", res.data);
    } catch (e) {
        if (e.response) {
            console.log("Error status:", e.response.status);
            console.log("Error data:", e.response.data);
        } else {
            console.log("No response:", e.message);
        }
    }
};

run();
