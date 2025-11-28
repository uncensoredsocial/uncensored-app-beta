// Search Functionality
class SearchManager {
    constructor() {
        this.currentQuery = '';
        this.currentFilter = 'all';
        this.searchTimeout = null;
        this.isSearching = false;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadRecentSearches();
        this.updateUI();
    }

    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');
        const filterTabs = document.querySelectorAll('.filter-tab');
        const recentList = document.getElementById('recentList');

        // Search input events
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearchInput(e.target.value);
            });

            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.performSearch(e.target.value);
                }
            });

            searchInput.addEventListener('focus', () => {
                this.showSearchSuggestions();
            });
        }

        // Clear search button
        if (clearSearch) {
            clearSearch.addEventListener('click', () => {
                this.clearSearch();
            });
        }

        // Filter tabs
        filterTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.handleFilterChange(e.target.dataset.filter);
            });
        });

        // Recent searches delegation
        if (recentList) {
            recentList.addEventListener('click', (e) => {
                if (e.target.classList.contains('recent-query')) {
                    const query = e.target.textContent;
                    this.performSearch(query);
                } else if (e.target.classList.contains('clear-recent') || e.target.closest('.clear-recent')) {
                    const item = e.target.closest('.recent-item');
                    this.removeRecentSearch(item.dataset.query);
                }
            });
        }
    }

    handleSearchInput(query) {
        this.currentQuery = query.trim();
        const clearSearchBtn = document.getElementById('clearSearch');

        // Show/hide clear button
        if (clearSearchBtn) {
            clearSearchBtn.style.display = this.currentQuery ? 'flex' : 'none';
        }

        // Clear previous timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }

        // Perform search after delay (debounce)
        if (this.currentQuery.length >= 2) {
            this.searchTimeout = setTimeout(() => {
                this.performSearch(this.currentQuery);
            }, 300);
        } else if (this.currentQuery.length === 0) {
            this.clearSearch();
        }
    }

    async performSearch(query) {
        if (!query || query.length < 2) {
            this.showDefaultState();
            return;
        }

        this.currentQuery = query;
        this.isSearching = true;

        // Update UI to loading state
        this.showLoadingState();

        try {
            // Save to recent searches
            this.saveToRecentSearches(query);

            // Perform API call
            const results = await this.fetchSearchResults(query, this.currentFilter);

            // Display results
            this.displaySearchResults(results, query);

        } catch (error) {
            console.error('Search error:', error);
            this.showErrorState();
        } finally {
            this.isSearching = false;
        }
    }

    async fetchSearchResults(query, filter) {
        // Simulate API call - replace with actual backend endpoint
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Mock data - replace with actual API response
        const mockResults = {
            users: [
                {
                    id: '1',
                    username: 'john_doe',
                    displayName: 'John Doe',
                    avatar: 'assets/icons/default-profile.png',
                    bio: 'Digital creator and tech enthusiast',
                    isFollowing: false
                },
                {
                    id: '2',
                    username: 'jane_smith',
                    displayName: 'Jane Smith',
                    avatar: 'assets/icons/default-profile.png',
                    bio: 'Photographer and traveler',
                    isFollowing: true
                }
            ],
            posts: [
                {
                    id: '1',
                    userId: '1',
                    content: `Just discovered this amazing social platform! The search functionality is incredible. #SocialMedia #Tech`,
                    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                    likes: 15,
                    comments: 3,
                    user: {
                        username: 'john_doe',
                        displayName: 'John Doe',
                        avatar: 'assets/icons/default-profile.png'
                    }
                },
                {
                    id: '2',
                    userId: '2',
                    content: `Beautiful sunset today! #Photography #Nature`,
                    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
                    likes: 42,
                    comments: 8,
                    user: {
                        username: 'jane_smith',
                        displayName: 'Jane Smith',
                        avatar: 'assets/icons/default-profile.png'
                    }
                }
            ],
            hashtags: [
                {
                    name: 'SocialMedia',
                    count: 2540
                },
                {
                    name: 'Tech',
                    count: 1820
                },
                {
                    name: 'Photography',
                    count: 1560
                }
            ]
        };

        return mockResults;
    }

    displaySearchResults(results, query) {
        this.hideAllStates();
        
        const resultsState = document.getElementById('searchResultsState');
        const resultsTitle = document.getElementById('resultsTitle');
        const resultsCount = document.getElementById('resultsCount');

        if (resultsState && resultsTitle && resultsCount) {
            resultsState.style.display = 'block';
            resultsTitle.textContent = `Results for "${query}"`;
            
            // Calculate total results
            const totalResults = Object.values(results).reduce((total, section) => total + section.length, 0);
            resultsCount.textContent = `${totalResults} results`;

            // Display results by section
            this.displayUsersResults(results.users);
            this.displayPostsResults(results.posts);
            this.displayHashtagsResults(results.hashtags);

            // Show no results if empty
            if (totalResults === 0) {
                this.showNoResults();
            }
        }
    }

    displayUsersResults(users) {
        const usersList = document.getElementById('usersList');
        const usersSection = document.getElementById('usersResults');

        if (!usersList || !usersSection) return;

        if (users.length === 0) {
            usersSection.style.display = 'none';
            return;
        }

        usersSection.style.display = 'block';
        usersList.innerHTML = users.map(user => `
            <a href="profile.html?user=${user.username}" class="user-card">
                <img src="${user.avatar}" alt="${user.displayName}" class="user-avatar" onerror="this.src='assets/icons/default-profile.png'">
                <div class="user-info">
                    <div class="user-name">${this.escapeHtml(user.displayName)}</div>
                    <div class="user-handle">@${user.username}</div>
                    ${user.bio ? `<div class="user-bio">${this.escapeHtml(user.bio)}</div>` : ''}
                </div>
                <button class="btn btn-sm ${user.isFollowing ? 'btn-secondary' : 'btn-primary'} follow-btn">
                    ${user.isFollowing ? 'Following' : 'Follow'}
                </button>
            </a>
        `).join('');
    }

    displayPostsResults(posts) {
        const postsList = document.getElementById('postsList');
        const postsSection = document.getElementById('postsResults');

        if (!postsList || !postsSection) return;

        if (posts.length === 0) {
            postsSection.style.display = 'none';
            return;
        }

        postsSection.style.display = 'block';
        postsList.innerHTML = posts.map(post => `
            <div class="post-card" onclick="window.location.href='post.html?id=${post.id}'">
                <div class="post-header">
                    <img src="${post.user.avatar}" alt="${post.user.displayName}" class="post-user-avatar" onerror="this.src='assets/icons/default-profile.png'">
                    <div class="post-user-info">
                        <div class="post-display-name">${this.escapeHtml(post.user.displayName)}</div>
                        <div class="post-username">@${post.user.username}</div>
                    </div>
                    <div class="post-time">${this.formatTime(post.createdAt)}</div>
                </div>
                <div class="post-content">
                    ${this.formatPostContent(post.content)}
                </div>
                <div class="post-actions">
                    <button class="post-action like-btn">
                        <span>❤️</span>
                        <span>${post.likes}</span>
                    </button>
                    <button class="post-action comment-btn">
                        <span>💬</span>
                        <span>${post.comments}</span>
                    </button>
                </div>
            </div>
        `).join('');
    }

    displayHashtagsResults(hashtags) {
        const hashtagsList = document.getElementById('hashtagsList');
        const hashtagsSection = document.getElementById('hashtagsResults');

        if (!hashtagsList || !hashtagsSection) return;

        if (hashtags.length === 0) {
            hashtagsSection.style.display = 'none';
            return;
        }

        hashtagsSection.style.display = 'block';
        hashtagsList.innerHTML = hashtags.map(hashtag => `
            <a href="hashtag.html?tag=${hashtag.name}" class="hashtag-item">
                <span class="icon icon-feeds hashtag-icon"></span>
                <div class="hashtag-info">
                    <div class="hashtag-name">#${hashtag.name}</div>
                    <div class="hashtag-count">${hashtag.count.toLocaleString()} posts</div>
                </div>
            </a>
        `).join('');
    }

    handleFilterChange(filter) {
        this.currentFilter = filter;
        
        // Update active tab
        document.querySelectorAll('.filter-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.filter === filter);
        });

        // Refresh search if we have a current query
        if (this.currentQuery) {
            this.performSearch(this.currentQuery);
        }
    }

    clearSearch() {
        const searchInput = document.getElementById('searchInput');
        const clearSearchBtn = document.getElementById('clearSearch');

        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }

        if (clearSearchBtn) {
            clearSearchBtn.style.display = 'none';
        }

        this.currentQuery = '';
        this.showDefaultState();
    }

    showDefaultState() {
        this.hideAllStates();
        const defaultState = document.getElementById('searchDefault');
        if (defaultState) {
            defaultState.style.display = 'block';
        }
    }

    showLoadingState() {
        this.hideAllStates();
        const loadingState = document.getElementById('searchLoading');
        if (loadingState) {
            loadingState.style.display = 'block';
        }
    }

    showNoResults() {
        const noResults = document.getElementById('noResults');
        if (noResults) {
            noResults.style.display = 'block';
        }
    }

    showErrorState() {
        this.hideAllStates();
        // You could implement a specific error state here
        this.showNoResults();
    }

    hideAllStates() {
        const states = [
            'searchDefault',
            'searchLoading',
            'searchResultsState',
            'noResults'
        ];

        states.forEach(stateId => {
            const element = document.getElementById(stateId);
            if (element) {
                element.style.display = 'none';
            }
        });

        // Hide all result sections
        const sections = ['usersResults', 'postsResults', 'hashtagsResults'];
        sections.forEach(sectionId => {
            const element = document.getElementById(sectionId);
            if (element) {
                element.style.display = 'none';
            }
        });
    }

    showSearchSuggestions() {
        // Implement search suggestions dropdown
        // This would show a dropdown with suggested searches
    }

    // Recent Searches Management
    loadRecentSearches() {
        const recentSearches = JSON.parse(localStorage.getItem('recentSearches') || '[]');
        this.displayRecentSearches(recentSearches);
    }

    displayRecentSearches(searches) {
        const recentList = document.getElementById('recentList');
        if (!recentList) return;

        if (searches.length === 0) {
            recentList.innerHTML = '<div class="recent-item"><span class="recent-query">No recent searches</span></div>';
            return;
        }

        recentList.innerHTML = searches.map((query, index) => `
            <div class="recent-item" data-query="${this.escapeHtml(query)}">
                <span class="recent-query">${this.escapeHtml(query)}</span>
                <button class="btn btn-ghost btn-icon clear-recent" title="Remove from history">
                    <span class="icon icon-close"></span>
                </button>
            </div>
        `).join('');
    }

    saveToRecentSearches(query) {
        let recentSearches = JSON.parse(localStorage.getItem('recentSearches') || '[]');
        
        // Remove if already exists
        recentSearches = recentSearches.filter(q => q !== query);
        
        // Add to beginning
        recentSearches.unshift(query);
        
        // Keep only last 10 searches
        recentSearches = recentSearches.slice(0, 10);
        
        localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
        this.displayRecentSearches(recentSearches);
    }

    removeRecentSearch(query) {
        let recentSearches = JSON.parse(localStorage.getItem('recentSearches') || '[]');
        recentSearches = recentSearches.filter(q => q !== query);
        localStorage.setItem('recentSearches', JSON.stringify(recentSearches));
        this.displayRecentSearches(recentSearches);
    }

    // Utility functions
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins}m`;
        if (diffHours < 24) return `${diffHours}h`;
        if (diffDays < 7) return `${diffDays}d`;
        
        return date.toLocaleDateString();
    }

    formatPostContent(content) {
        if (!content) return '';
        
        let formatted = this.escapeHtml(content);
        
        // Convert URLs to links
        formatted = formatted.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color: var(--primary-color);">$1</a>');
        
        // Convert hashtags
        formatted = formatted.replace(/#(\w+)/g, '<span style="color: var(--primary-color);">#$1</span>');
        
        // Convert mentions
        formatted = formatted.replace(/@(\w+)/g, '<span style="color: var(--primary-color);">@$1</span>');
        
        return formatted;
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    updateUI() {
        const currentUser = getCurrentUser();
        const profileSection = document.getElementById('profileSection');
        const authButtons = document.getElementById('authButtons');

        if (profileSection && authButtons) {
            if (currentUser) {
                profileSection.style.display = 'flex';
                authButtons.style.display = 'none';
                
                // Update profile images
                const headerProfileImg = document.getElementById('headerProfileImg');
                const sidebarProfileImg = document.getElementById('sidebarProfileImg');
                const sidebarUserName = document.getElementById('sidebarUserName');
                const sidebarUserHandle = document.getElementById('sidebarUserHandle');
                
                if (headerProfileImg && currentUser.avatar_url) {
                    headerProfileImg.src = currentUser.avatar_url;
                }
                if (sidebarProfileImg && currentUser.avatar_url) {
                    sidebarProfileImg.src = currentUser.avatar_url;
                }
                if (sidebarUserName) {
                    sidebarUserName.textContent = currentUser.displayName || currentUser.username;
                }
                if (sidebarUserHandle) {
                    sidebarUserHandle.textContent = `@${currentUser.username}`;
                }
            } else {
                profileSection.style.display = 'none';
                authButtons.style.display = 'flex';
            }
        }
    }
}

// Initialize search manager when page loads
let searchManager;

document.addEventListener('DOMContentLoaded', () => {
    searchManager = new SearchManager();
});
