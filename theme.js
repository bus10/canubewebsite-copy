// Theme Toggle Functionality
function toggleTheme() {
    const body = document.body;
    const button = document.querySelector('.theme-toggle');
    
    if (body.getAttribute('data-theme') === 'light') {
        body.removeAttribute('data-theme');
        button.textContent = 'Light';
        localStorage.setItem('theme', 'dark');
    } else {
        body.setAttribute('data-theme', 'light');
        button.textContent = 'Dark';
        localStorage.setItem('theme', 'light');
    }
}

// Load saved theme or default to dark
function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const button = document.querySelector('.theme-toggle');
    
    if (savedTheme === 'light') {
        document.body.setAttribute('data-theme', 'light');
        if (button) button.textContent = 'Dark';
    } else {
        if (button) button.textContent = 'Light';
    }
}

// Initialize theme when DOM is loaded
document.addEventListener('DOMContentLoaded', initTheme);