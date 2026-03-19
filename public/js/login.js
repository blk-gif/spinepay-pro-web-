'use strict';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const loginBtn = document.getElementById('loginBtn');
  const errorMsg = document.getElementById('errorMsg');
  const errorText = document.getElementById('errorText');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');

  function showError(message) {
    errorText.textContent = message;
    errorMsg.classList.add('visible');
    loginBtn.classList.remove('loading');
    loginBtn.disabled = false;
    // Shake animation
    form.style.animation = 'none';
    requestAnimationFrame(() => {
      form.style.animation = 'shake 0.4s ease';
    });
  }

  function hideError() {
    errorMsg.classList.remove('visible');
  }

  function setLoading(loading) {
    loginBtn.classList.toggle('loading', loading);
    loginBtn.disabled = loading;
  }

  // Add shake keyframes dynamically
  const style = document.createElement('style');
  style.textContent = `
    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20%       { transform: translateX(-8px); }
      40%       { transform: translateX(8px); }
      60%       { transform: translateX(-5px); }
      80%       { transform: translateX(5px); }
    }
  `;
  document.head.appendChild(style);

  usernameInput.addEventListener('input', hideError);
  passwordInput.addEventListener('input', hideError);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username) {
      showError('Please enter your username.');
      usernameInput.focus();
      return;
    }
    if (!password) {
      showError('Please enter your password.');
      passwordInput.focus();
      return;
    }

    setLoading(true);
    hideError();

    try {
      const result = await window.api.auth.login({ username, password });

      if (result.success) {
        // Store user in sessionStorage
        sessionStorage.setItem('currentUser', JSON.stringify(result.user));
        sessionStorage.setItem('isAuthenticated', 'true');

        // Brief success flash then redirect
        loginBtn.innerHTML = '<span class="btn-text"><i class="fa-solid fa-check"></i> Welcome!</span>';
        loginBtn.style.background = 'linear-gradient(135deg, #2ecc71, #27ae60)';
        loginBtn.disabled = true;

        setTimeout(() => {
          window.location.href = 'app.html';
        }, 500);
      } else {
        showError(result.error || 'Invalid username or password.');
        passwordInput.value = '';
        passwordInput.focus();
      }
    } catch (err) {
      console.error('Login error:', err);
      showError('Connection error. Please try again.');
      setLoading(false);
    }
  });

  // Focus username on load
  usernameInput.focus();
});
