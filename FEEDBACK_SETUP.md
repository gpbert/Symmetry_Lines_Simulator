# 📝 Feedback System Setup Guide

Your feedback system is ready! Follow these steps to set it up on Vercel with Resend.

## ✅ Step 1: Sign up for Resend (Free)

1. Go to [resend.com](https://resend.com)
2. Sign up with your email (it's free - 100 emails/day, 3,000/month)
3. Verify your email

## ✅ Step 2: Get your API Key

1. In Resend dashboard, go to **API Keys**
2. Click **Create API Key**
3. Name it: `30cm Grid Simulator`
4. Copy the API key (starts with `re_...`)

## ✅ Step 3: Add Domain (or use test domain)

### Option A: Use your own domain (recommended)
1. In Resend, go to **Domains**
2. Click **Add Domain**
3. Enter your domain (e.g., `feedback.yourdomain.com`)
4. Follow DNS setup instructions
5. Wait for verification (usually 5-10 minutes)

### Option B: Use Resend test domain (quick start)
- You can send emails to yourself only
- From address: `onboarding@resend.dev`
- Good for testing!

## ✅ Step 4: Configure Vercel

1. Push your code to GitHub (the files are already created)
2. In your Vercel project dashboard, go to **Settings** → **Environment Variables**
3. Add a new variable:
   - **Name:** `RESEND_API_KEY`
   - **Value:** Your Resend API key (the one you copied)
   - **Environments:** Select all (Production, Preview, Development)
4. Click **Save**

## ✅ Step 5: Update the feedback function

Edit `api/feedback.js` and change these lines:

```javascript
from: 'Feedback <feedback@yourdomain.com>', // Change to your domain
to: ['your@email.com'], // Change to your email address
```

**If using test domain:**
```javascript
from: 'Feedback <onboarding@resend.dev>',
to: ['your@email.com'], // Must be YOUR email (test mode restriction)
```

## ✅ Step 6: Deploy

1. Commit your changes:
```bash
git add .
git commit -m "Add feedback system"
git push
```

2. Vercel will automatically deploy
3. Wait for deployment to complete (~30 seconds)

## 🎉 Test It!

1. Visit your live site
2. Click **Send Feedback** button
3. Fill out the form
4. Check your email!

## 📧 Customizing the Email

The email template is in `api/feedback.js`. You can customize:
- Subject line
- HTML styling
- Layout
- Brand colors

## 🐛 Troubleshooting

**Email not sending?**
- Check Vercel logs: Project → Deployments → Click deployment → View Function Logs
- Verify `RESEND_API_KEY` is set in Vercel
- Confirm your domain is verified in Resend

**Getting "Method not allowed"?**
- The function only accepts POST requests (this is correct)

**Form shows error?**
- Check browser console for errors
- Verify `/api/feedback` endpoint exists after deployment

## 💰 Pricing

Resend Free Tier:
- ✅ 100 emails per day
- ✅ 3,000 emails per month
- ✅ Perfect for feedback forms

Need more? Paid plans start at $20/month for 50,000 emails.

---

**Need help?** Check the [Resend docs](https://resend.com/docs) or ask me!

