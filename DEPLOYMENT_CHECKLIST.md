# Math Phoenix - Deployment Checklist

Use this checklist to ensure a smooth deployment process.

## 📋 Pre-Deployment Checklist

### API Keys & Secrets
- [ ] OpenRouter API key obtained (https://openrouter.ai/keys)
- [ ] Data logging enabled in OpenRouter Settings → Privacy
- [ ] OpenRouter account has free tier or $10 credit activated
- [ ] Strong `SESSION_SECRET` generated (min 32 characters)
- [ ] Strong `DASHBOARD_PASSWORD` chosen

### Code & Configuration
- [ ] All code committed to Git repository
- [ ] Repository pushed to GitHub/GitLab
- [ ] `.env` file created (never commit this!)
- [ ] All environment variables set in `.env`
- [ ] Backend tested locally (`npm run dev`)
- [ ] Frontend tested locally (`npm run dev`)
- [ ] API endpoints tested (`npm run test:api`)

## 🚀 Deployment Checklist

### Choose Your Deployment Option

#### Option 1: Render (Recommended)
- [ ] Render account created
- [ ] Repository connected to Render
- [ ] Blueprint deployed from `render.yaml`
- [ ] Environment variables added in Render dashboard:
  - [ ] `OPENROUTER_API_KEY`
  - [ ] `DASHBOARD_PASSWORD`
  - [ ] (Optional: model environment variables)
- [ ] Backend service deployed successfully
- [ ] Frontend service deployed successfully
- [ ] Health check passing (`/health` endpoint)

#### Option 2: Railway + Vercel
- [ ] Railway account created
- [ ] Railway CLI installed
- [ ] Backend deployed to Railway with environment variables
- [ ] Railway backend URL noted
- [ ] Vercel account created
- [ ] Vercel CLI installed
- [ ] Frontend deployed to Vercel
- [ ] `VITE_API_URL` set in Vercel to Railway backend URL

#### Option 3: Docker (Self-Hosted)
- [ ] Docker and Docker Compose installed on server
- [ ] `.env` file created with OpenRouter credentials
- [ ] docker-compose up deployed successfully
- [ ] Reverse proxy (nginx/Caddy) configured for HTTPS

## ✅ Post-Deployment Verification

### Backend Tests
- [ ] Health check endpoint accessible: `GET /health`
- [ ] Create session works: `POST /api/sessions`
- [ ] Backend logs show no errors
- [ ] OpenRouter API calls working

### Frontend Tests
- [ ] Frontend loads without errors
- [ ] Can enter school code
- [ ] Can create new session
- [ ] Can submit text problem
- [ ] Can submit image problem
- [ ] Chat interface works
- [ ] Math rendering (KaTeX) works
- [ ] Teacher dashboard accessible at `/dashboard`
- [ ] Dashboard login works with password

### Integration Tests
- [ ] End-to-end: Create session → Submit problem → Chat → Solve
- [ ] Image upload → OCR → Problem extraction works
- [ ] Teacher dashboard shows sessions
- [ ] Session details view works
- [ ] Problem tagging works
- [ ] Collaboration feature works (if enabled)

### Performance & Monitoring
- [ ] Page load time acceptable (< 3 seconds)
- [ ] API response time acceptable (< 2 seconds)
- [ ] No console errors in browser
- [ ] No 500 errors in backend logs
- [ ] Monitoring/logging configured (optional)

## 🔐 Security Checklist

### Secrets Management
- [ ] `.env` file NOT committed to Git
- [ ] All secrets stored as environment variables
- [ ] Strong passwords used for dashboard

### Network Security
- [ ] HTTPS enabled for frontend
- [ ] HTTPS enabled for backend
- [ ] CORS configured to allow only your frontend domain
- [ ] Backend API requires authentication for protected endpoints

### Application Security
- [ ] Rate limiting considered (see Phase 3 in tasks.md)
- [ ] Input validation in place
- [ ] Error messages don't leak sensitive info
- [ ] Session codes properly validated
- [ ] Dashboard authentication working

## 📊 Monitoring Setup (Optional but Recommended)

### Uptime Monitoring
- [ ] UptimeRobot configured for frontend
- [ ] UptimeRobot configured for backend `/health`
- [ ] Email/SMS alerts configured

### Error Tracking
- [ ] Sentry account created (optional)
- [ ] Sentry DSN added to environment variables
- [ ] Error tracking verified

### Analytics
- [ ] Usage analytics configured (optional)
- [ ] Log aggregation configured

## 🌐 Domain & DNS (Optional)

### Custom Domain Setup
- [ ] Domain purchased/available
- [ ] SSL certificate obtained (Let's Encrypt or AWS ACM)
- [ ] DNS records configured:
  - [ ] A/AAAA record for backend
  - [ ] CNAME record for frontend (CloudFront/Vercel)
- [ ] Domain verified and working
- [ ] HTTPS working on custom domain
- [ ] Backend CORS updated for custom domain

## 📝 Documentation & Communication

### Internal Documentation
- [ ] Deployment process documented
- [ ] Environment variables documented
- [ ] Troubleshooting guide created
- [ ] Runbook for common issues

### User Communication
- [ ] Frontend URL shared with users
- [ ] User guide/instructions provided
- [ ] Teacher dashboard access instructions shared
- [ ] Support contact information provided

## 🔄 Continuous Deployment (Optional)

### CI/CD Setup
- [ ] GitHub Actions workflow configured
- [ ] Secrets added to GitHub repository
- [ ] Automatic deployment on push to `main` tested
- [ ] Deployment notifications configured

## 💰 Cost Management

### OpenRouter Costs
- [ ] Free tier understood (50 requests/day)
- [ ] $10 one-time credit unlocks 1,000 requests/day
- [ ] Cost per session estimated (free models have zero cost)
- [ ] Usage limits understood

### Hosting Costs
- [ ] Monthly hosting costs calculated (Render: $0-7/month)
- [ ] Budget allocated
- [ ] Cost monitoring configured

## 🎯 Launch Preparation

### Final Checks
- [ ] All tests passing
- [ ] Performance acceptable
- [ ] Security measures in place
- [ ] Monitoring configured
- [ ] Documentation complete
- [ ] Team trained on deployment process
- [ ] Rollback plan documented

### Launch Day
- [ ] Deployment completed during low-traffic period
- [ ] All services verified working
- [ ] Monitoring dashboard open
- [ ] Team on standby for issues
- [ ] Users notified of launch

### Post-Launch
- [ ] Monitor for first 24-48 hours
- [ ] Address any issues immediately
- [ ] Gather user feedback
- [ ] Plan improvements based on feedback
- [ ] Celebrate success! 🎉

---

## 📞 Emergency Contacts

- **OpenRouter Support**: [OpenRouter Help](https://openrouter.ai/docs)
- **Render Support**: [Render Support](https://render.com/support)
- **Railway Support**: [Railway Help](https://railway.app/help)
- **Vercel Support**: [Vercel Support](https://vercel.com/support)

---

## 🔄 Regular Maintenance

### Weekly
- [ ] Review error logs
- [ ] Check uptime reports
- [ ] Monitor costs

### Monthly
- [ ] Review and optimize costs
- [ ] Update dependencies
- [ ] Rotate secrets (if needed)
- [ ] Review security settings

### Quarterly
- [ ] Full security audit
- [ ] Performance optimization
- [ ] User feedback review
- [ ] Feature planning

---

**Remember**: Deployment is an iterative process. Start simple, monitor closely, and improve over time!

