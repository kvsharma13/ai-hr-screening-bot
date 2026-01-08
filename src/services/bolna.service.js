// src/services/bolna.service.js
const axios = require('axios');

class BolnaService {
  
  constructor() {
    this.apiKey = process.env.BOLNA_API_KEY;
    this.agentId = process.env.BOLNA_AGENT_ID;
    this.fromNumber = process.env.BOLNA_FROM_NUMBER || '+918035738463';
    this.baseURL = 'https://api.bolna.ai';
  }

  /**
   * Update Bolna agent prompts
   */
  async updateAgentPrompt(systemPrompt) {
    try {
      const agentConfig = {
        agent_prompts: {
          task_1: {
            system_prompt: systemPrompt
          }
        }
      };

      const response = await axios.patch(
        `${this.baseURL}/agent/${this.agentId}`,
        agentConfig,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log('âœ“ Bolna agent prompt updated successfully');
      return response.data;
    } catch (error) {
      console.error('âŒ Bolna agent update error:', error.response?.data || error.message);
      throw new Error('Failed to update Bolna agent');
    }
  }

  /**
   * Initiate a call through Bolna
   */
  async makeCall(phone, systemPrompt) {
    try {
      // First update the agent prompt
      await this.updateAgentPrompt(systemPrompt);

      // Ensure phone has + prefix
      let formattedPhone = phone;
      if (!formattedPhone.startsWith('+')) {
        formattedPhone = '+' + formattedPhone.replace(/\D/g, '');
      }

      console.log('Initiating Bolna call to:', formattedPhone);

      const callPayload = {
        agent_id: this.agentId,
        recipient_phone_number: formattedPhone,
        from_phone_number: this.fromNumber
      };

      const response = await axios.post(
        `${this.baseURL}/call`,
        callPayload,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // Extract run_id from response
      const runId = response.data.run_id || 
                    response.data.execution_id || 
                    response.data.call_id || 
                    response.data.callId || 
                    response.data.id;

      console.log('âœ“ Call initiated successfully, run_id:', runId);

      return {
        success: true,
        run_id: runId,
        data: response.data
      };

    } catch (error) {
      console.error('âŒ Bolna call error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  /**
   * Get agent details (for debugging)
   */
  async getAgentDetails() {
    try {
      const response = await axios.get(
        `${this.baseURL}/agent/${this.agentId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error fetching agent details:', error.message);
      throw error;
    }
  }
}

module.exports = new BolnaService();