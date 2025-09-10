document.addEventListener('DOMContentLoaded', function() {
  // Check if sidebar TOC exists
  const sidebarToc = document.getElementById('sidebar-toc');
  if (!sidebarToc) return;
  
  // Get all headers from the content
  const content = document.querySelector('.page__content');
  if (!content) return;
  
  const headers = content.querySelectorAll('h1, h2, h3, h4, h5, h6');
  if (headers.length === 0) return;
  
  // Create TOC menu
  const tocMenu = sidebarToc.querySelector('.toc__menu');
  if (!tocMenu) return;
  
  headers.forEach(function(header) {
    // Skip if header doesn't have an ID
    if (!header.id) return;
    
    // Create list item
    const li = document.createElement('li');
    const a = document.createElement('a');
    
    // Set link properties
    a.href = '#' + header.id;
    a.textContent = header.textContent;
    
    // Add appropriate class based on header level
    const level = parseInt(header.tagName.charAt(1));
    if (level > 2) {
      li.classList.add('toc__sub-' + (level - 2));
    }
    
    // Add smooth scroll behavior
    a.addEventListener('click', function(e) {
      e.preventDefault();
      header.scrollIntoView({ behavior: 'smooth' });
      
      // Update active state
      document.querySelectorAll('.sidebar-toc a').forEach(function(link) {
        link.classList.remove('active');
      });
      a.classList.add('active');
    });
    
    li.appendChild(a);
    tocMenu.appendChild(li);
  });
  
  // Highlight current section on scroll
  let ticking = false;
  function updateActiveLink() {
    const scrollPosition = window.scrollY + 100;
    
    headers.forEach(function(header) {
      const headerTop = header.offsetTop;
      const headerHeight = header.offsetHeight;
      
      if (scrollPosition >= headerTop && scrollPosition < headerTop + headerHeight + 200) {
        const link = tocMenu.querySelector('a[href="#' + header.id + '"]');
        if (link) {
          document.querySelectorAll('.sidebar-toc a').forEach(function(l) {
            l.classList.remove('active');
          });
          link.classList.add('active');
        }
      }
    });
    
    ticking = false;
  }
  
  window.addEventListener('scroll', function() {
    if (!ticking) {
      window.requestAnimationFrame(updateActiveLink);
      ticking = true;
    }
  });
});