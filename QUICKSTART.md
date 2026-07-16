# Math Phoenix - Quick Start Deployment Guide

This guide will help you deploy Math Phoenix in **under 30 minutes** using the easiest deployment options.

## 🎯 Recommended Path: Render (All-in-One)

**Best for**: First-time deployment, minimal configuration
**Cost**: Free tier available (with limitations) or $7/month
**Time**: ~15 minutes

### Step 1: Prepare Your Repository

1. **Fork or clone** this repository to your GitHub account
2. Make sure you have:
   - OpenRouter API key ([Get one here](https://openrouter.ai/keys))
   - Enable data logging for free models in Settings → Privacy

### Step 2: Deploy to Render

1. **Go to [Render Dashboard](https://dashboard.render.com/)**

2. **Click "New +" → "Blueprint"**

3. **Connect your GitHub repository**

4. **Render will detect `render.yaml`** and show you the services to create:
   - Backend API (Node.js)
   - Frontend Static Site

5. **Add your environment variables**:
   - `OPENROUTER_API_KEY` - Your OpenRouter API key
   - `DASHBOARD_PASSWORD` - Choose a secure password
   - (Optional: `TEXT_MODEL`, `VISION_MODEL`, and fallback models)

6. **Click "Apply"** and wait for deployment (~5-10 minutes)

7. **Done!** Your app is live at:
   - Frontend: `https://math-phoenix-frontend.onrender.com`
   - Backend: `https://math-phoenix-backend.onrender.com`

### Step 3: Test Your Deployment

1. Visit your frontend URL
2. Enter a school code (e.g., "TEST123")
3. Try submitting a math problem
4. Test the teacher dashboard at `/dashboard`

---

## 🚀 Alternative: Railway + Vercel

**Best for**: Better performance, separate frontend/backend control
**Cost**: Railway $5/month, Vercel free
**Time**: ~20 minutes

### Backend: Deploy to Railway

1. **Install Railway CLI**:
   ```bash
   npm install -g @railway/cli
   ```

2. **Login and deploy**:
   ```bash
   railway login
   cd backend
   railway init
   railway up
   ```

3. **Add environment variables** in Railway dashboard:
   - `OPENROUTER_API_KEY` - Your OpenRouter API key
   - `SESSION_SECRET` - Random secret (min 32 chars)
   - `DASHBOARD_PASSWORD` - Secure password
   - (Optional: `TEXT_MODEL`, `VISION_MODEL`, fallback models)

4. **Get your backend URL**:
   ```bash
   railway domain
   ```
   Note this URL (e.g., `https://math-phoenix-backend.up.railway.app`)

### Frontend: Deploy to Vercel

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Deploy**:
   ```bash
   cd frontend
   vercel
   ```

3. **Add environment variable** in Vercel dashboard:
   - `VITE_API_URL` = Your Railway backend URL

4. **Redeploy**:
   ```bash
   vercel --prod
   ```

5. **Done!** Your frontend is live at your Vercel URL

---

## 🐳 Docker Deployment (Advanced)

**Best for**: Self-hosting, custom infrastructure
**Cost**: Depends on hosting provider
**Time**: ~30 minutes

### Step 1: Build and Run with Docker Compose

1. **Create `.env` file** (copy from `env.example`)

2. **Run**:
   ```bash
   docker-compose up -d
   ```

3. **Access**:
   - Frontend: http://localhost:5173
   - Backend: http://localhost:3001

### Step 2: Deploy to Your Server

1. **Copy files to your server**:
   ```bash
   scp -r . user@your-server:/path/to/math-phoenix
   ```

2. **SSH into server and run**:
   ```bash
   cd /path/to/math-phoenix
   docker-compose up -d
   ```

3. **Set up reverse proxy** (nginx/Caddy) for HTTPS

---

## ✅ Post-Deployment Checklist

- [ ] Test creating a session
- [ ] Test submitting a text problem
- [ ] Test submitting an image problem
- [ ] Test the chat functionality
- [ ] Access teacher dashboard with your password
- [ ] Test the health endpoint (`/health`)
- [ ] Set up monitoring (optional but recommended)
- [ ] Configure custom domain (optional)

---

## 🔧 Common Issues & Solutions

### "Cannot connect to backend"
- **Frontend**: Check `VITE_API_URL` is set correctly
- **Backend**: Verify backend is running and accessible
- **CORS**: Ensure backend allows your frontend domain

### "OpenRouter API error"
- Verify your API key is valid at https://openrouter.ai/keys
- Check you have enabled data logging for free models
- Ensure you have remaining free requests (50/day free, 1,000/day with $10 credit)

---

## 📊 Monitoring Your Deployment

### Health Check
```bash
curl https://your-backend-url/health
```

### View Logs

**Render**: Dashboard → Service → Logs
**Railway**: `railway logs`
**Vercel**: Dashboard → Deployment → Function Logs

---

## 🎓 Next Steps

1. **Share your app**: Give users your frontend URL
2. **Monitor usage**: Check logs and metrics regularly
3. **Set up alerts**: Configure uptime monitoring
4. **Gather feedback**: Improve based on user experience
5. **Scale**: Upgrade plans as usage grows

---

## 💡 Tips for Success

- **Start with free tiers** to test before committing to paid plans
- **Monitor OpenRouter usage** - free tier has 50 req/day limit
- **Set up error tracking** (Sentry, LogRocket) for production
- **Use environment-specific configs** (dev, staging, prod)
- **Keep secrets secure** - never commit `.env` files

---

## 🆘 Need Help?

- Check [DEPLOYMENT.md](DEPLOYMENT.md) for detailed instructions
- Review [SETUP.md](SETUP.md) for environment variable configuration
- Check logs for error messages
- Verify all environment variables are set correctly

---

**Congratulations!** 🎉 Your Math Phoenix is now live and ready for students!

