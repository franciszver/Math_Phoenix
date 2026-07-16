# Math Phoenix - Deployment Guide

This guide covers multiple deployment options for hosting Math Phoenix so others can use it.

## 🏗️ Architecture Overview

Math Phoenix consists of:
- **Frontend**: React + Vite static site
- **Backend**: Express.js API server
- **Database**: In-memory storage (resets on restart — demo design)
- **Image Processing**: In-memory via OpenRouter Vision API
- **External APIs**: OpenRouter API

## 📋 Deployment Options

### Option 1: Render (Recommended — All-in-One)
- **Frontend**: Render Static Site
- **Backend**: Render Web Service
- **Best for**: Simplest setup, minimal configuration, free tier available
- **Blueprint**: Use `render.yaml` for one-click deployment

### Option 2: Vercel + Railway (Separate Control)
- **Frontend**: Vercel
- **Backend**: Railway
- **Best for**: Fine-grained control, separate scaling

### Option 3: Docker (Self-Hosted)
- **Deployment**: Any Docker-compatible host
- **Best for**: Custom infrastructure, on-premises

---

## 🚀 Option 1: Render (Recommended)

### Prerequisites
- Render account (free at https://render.com)
- GitHub repository with this code

### Step 1: Deploy with Blueprint

1. **Go to [Render Dashboard](https://dashboard.render.com/)**
2. **Click "New +" → "Blueprint"**
3. **Select your GitHub repository**
4. **Render will detect `render.yaml`** and display the services to create
5. **Add environment variables** in the confirmation dialog:
   - `OPENROUTER_API_KEY` - Your OpenRouter API key
   - `DASHBOARD_PASSWORD` - Choose a secure password
6. **Click "Apply"** and wait for deployment (~5-10 minutes)

### Step 2: Verify Deployment
- Frontend: `https://math-phoenix-frontend.onrender.com`
- Backend: `https://math-phoenix-backend.onrender.com`
- Test the `/health` endpoint on the backend

---

## 🚀 Option 2: Vercel + Railway (Separate Control)

### Step 1: Deploy Backend to Railway

#### 1.1 Install Railway CLI
```bash
npm install -g @railway/cli
```

#### 1.2 Login and Initialize
```bash
railway login
cd backend
railway init
```

#### 1.3 Add Environment Variables
Go to Railway dashboard and add:
- `NODE_ENV=production`
- `OPENROUTER_API_KEY` - Your OpenRouter API key
- `SESSION_SECRET` - Random secret (min 32 chars)
- `DASHBOARD_PASSWORD` - Secure password
- (Optional: `TEXT_MODEL`, `VISION_MODEL`, fallback models)

#### 1.4 Deploy
```bash
railway up
```

#### 1.5 Get Backend URL
```bash
railway domain
# Note the URL (e.g., math-phoenix-backend.up.railway.app)
```

### Step 2: Deploy Frontend to Vercel

#### 2.1 Install Vercel CLI
```bash
npm install -g vercel
```

#### 2.2 Deploy
```bash
cd frontend
vercel
```

#### 2.3 Add Environment Variable
In Vercel dashboard, add:
- `VITE_API_URL=https://your-backend.up.railway.app`

#### 2.4 Redeploy
```bash
vercel --prod
```

---

## 🚀 Option 3: Docker (Self-Hosted)

### Prerequisites
- Docker and Docker Compose installed
- Your own server or hosting provider

### Step 1: Build and Deploy

1. **Create `.env` file** (copy from `.env.example` and add your OpenRouter API key)

2. **Run with Docker Compose**:
   ```bash
   docker-compose up -d
   ```

3. **Access**:
   - Frontend: http://localhost:5173
   - Backend: http://localhost:3001

4. **Set up reverse proxy** (nginx/Caddy) for HTTPS and custom domain

---

## 🔧 Post-Deployment Configuration

### 1. Test the Deployment

#### Health Check
```bash
curl https://your-backend-url/health
```

#### Create Session
```bash
curl -X POST https://your-backend-url/api/sessions \
  -H "Content-Type: application/json" \
  -d '{"school_code": "TEST123"}'
```

### 2. Monitor Logs

#### Render
- View logs in Render dashboard

#### Railway
```bash
railway logs
```

### 3. Set Up Monitoring (Optional)

#### External Monitoring
- [UptimeRobot](https://uptimerobot.com/) - Free uptime monitoring
- [Sentry](https://sentry.io/) - Error tracking
- [LogRocket](https://logrocket.com/) - Session replay

---

## 💰 Cost Estimates

### Render (Option 1)
- **Backend**: Free or $7/month (Starter)
- **Frontend**: Free
- **OpenRouter**: Free tier (50 req/day) or ~$10 one-time for 1,000 req/day
- **Total**: Free or ~$7-10/month

### Railway + Vercel (Option 2)
- **Railway**: $5-20/month (depending on usage)
- **Vercel**: Free (Hobby) or $20/month (Pro)
- **OpenRouter**: Free tier (50 req/day) or ~$10 one-time for 1,000 req/day
- **Total**: ~$5-30/month

### Docker (Option 3)
- **Server hosting**: Varies ($5-50+/month depending on provider)
- **OpenRouter**: Free tier (50 req/day) or ~$10 one-time for 1,000 req/day
- **Total**: ~$5-60+/month

---

## 🔐 Security Checklist

- [ ] Use environment variables for all secrets (never commit `.env`)
- [ ] Enable HTTPS/SSL for both frontend and backend
- [ ] Set strong `DASHBOARD_PASSWORD`
- [ ] Set up rate limiting (see Phase 3 in tasks.md)
- [ ] Configure CORS properly (only allow your frontend domain)
- [ ] Validate and sanitize all user inputs
- [ ] Keep OpenRouter API key secure (never expose in frontend)
- [ ] Regularly rotate secrets and API keys

---

## 🔄 Continuous Deployment (CI/CD)

### GitHub Actions (Recommended)

See `.github/workflows/deploy.yml` for automated deployment on push to `main` branch.

### Manual Deployment

#### Render
- Render automatically deploys on push to your connected branch

#### Railway
```bash
cd backend && railway up
```

#### Vercel
```bash
cd frontend && vercel --prod
```

---

## 🐛 Troubleshooting

### Backend Issues

#### "OpenRouter API error"
- Verify `OPENROUTER_API_KEY` is valid and active
- Check OpenRouter dashboard for remaining requests
- Ensure free models are enabled in Settings → Privacy

#### "CORS error"
- Verify `FRONTEND_URL` environment variable matches your frontend domain
- Check backend CORS configuration

### Frontend Issues

#### "API calls failing"
- Verify `VITE_API_URL` is set correctly during build
- Check backend is running and accessible
- Inspect browser console for CORS or network errors

#### "Blank page after deployment"
- Check browser console for errors
- Verify build completed successfully
- Ensure `index.html` is in the root of the deployment

---

## 📚 Additional Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Railway Documentation](https://docs.railway.app/)
- [Render Documentation](https://render.com/docs)

---

## 🆘 Support

If you encounter issues during deployment:
1. Check the logs (see "Monitor Logs" section above)
2. Review the troubleshooting section
3. Ensure all environment variables are set correctly

---

## 📝 Next Steps After Deployment

1. **Test thoroughly**: Create sessions, submit problems, test chat
2. **Set up monitoring**: Configure alerts for errors and downtime
3. **Share the URL**: Give users access to your frontend URL
4. **Gather feedback**: Monitor usage and iterate
5. **Scale as needed**: Upgrade instances/plans based on traffic

---

**Congratulations!** 🎉 Your Math Phoenix application is now live and accessible to others!

