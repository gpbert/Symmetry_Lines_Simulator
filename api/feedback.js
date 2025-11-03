import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, message } = req.body;

  // Validate message
  if (!message || message.trim().length === 0) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    await resend.emails.send({
      from: 'Feedback <onboarding@resend.dev>', // Resend test domain - ready to use!
      to: ['gpsiebert@gmail.com'], // Resend test domain requires this to be your signup email
      subject: '📝 New Feedback from 30cm Grid Simulator',
      html: `
        <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a1a1a; font-size: 20px; margin-bottom: 20px;">New Feedback Received</h2>
          
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
            <p style="margin: 0; color: #6b6b6b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">From</p>
            <p style="margin: 0; color: #1a1a1a; font-size: 14px;">${email || 'Anonymous'}</p>
          </div>
          
          <div style="background: #f5f5f5; padding: 16px; border-radius: 8px;">
            <p style="margin: 0; color: #6b6b6b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Message</p>
            <p style="margin: 0; color: #1a1a1a; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${message}</p>
          </div>
          
          <p style="margin-top: 20px; color: #9b9b9b; font-size: 12px; text-align: center;">
            Sent from 30cm Grid Simulator
          </p>
        </div>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error sending email:', error);
    return res.status(500).json({ error: 'Failed to send feedback' });
  }
}

