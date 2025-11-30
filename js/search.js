// Search Functionality with Supabase Integration
class SearchManager {
    constructor() {
        this.currentQuery = '';
        this.currentFilter = 'all';
        this.searchTimeout = null;
        this.isSearching = false;
        this.supabase = null;
        
        this.init();
    }

    init() {
        this.initializeSupabase();
        this.setupEventListeners();
        this.loadRecentSearches();
        this.loadTrendingHashtags();
        this.updateUI();
    }

    initializeSupabase() {
        // Initialize Supabase client
        this.supabase = supabase.createClient(
            'https://hbbbsreonwhvqfvbszne.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhiYmJzcmVvbndodnFmdmJzem5lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyOTc5ODYsImV4cCI6MjA3OTg3Mzk4Nn0.LvqmdOqetnMrH8bnkJY6_S-dsGD8gnvpFczSCJPy-Q4'
        );
    }

    setupEventListeners() {
        const searchInput = document.getElementById('searchInput');
        const clearSearch = document.getElementById('clearSearch');
        const filterTabs = document.querySelectorAll('.filter-tab');
        const recentList = document.getElementById('recentList');
        const searchButton = document.getElementById('searchButton');

        // Search input events
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearchInput(e.target.value);
            });

            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.performSearch(e.target.value.trim());
                }
            });

            searchInput.addEventListener('focus', () => {
                this.showSearchSuggestions();
            });
        }

        // Search button events (NEW)
        if (searchButton) {
            searchButton.addEventListener('click', () => {
                const value = searchInput ? searchInput.value.trim() : '';
                console.log('Search button clicked with value:', value);
                this.performSearch(value);
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
        try {
            const results = {
                users: [],
                posts: [],
                hashtags: []
            };

            // Get current user for follow status checks
            const currentUser = getCurrentUser();

            // Search users
            if (filter === 'all' || filter === 'users') {
                const { data: users, error } = await this.supabase
                    .rpc('search_users', { 
                        search_query: query,
                        result_limit: 20
                    });
                
                if (!error && users) {
                    // Check follow status for each user if logged in
                    const usersWithFollowStatus = await Promise.all(
                        users.map(async (user) => {
                            let isFollowing = false;
                            
                            if (currentUser) {
                                const { data: follow } = await this.supabase
                                    .from('follows')
                                    .select('id')
                                    .eq('follower_id', currentUser.id)
                                    .eq('following_id', user.id)
                                    .single();
                                
                                isFollowing = !!follow;
                            }
                            
                            return {
                                id: user.id,
                                username: user.username,
                                displayName: user.display_name || user.username,
                                avatar: user.avatar_url || 'assets/icons/default-profile.png',
                                bio: user.bio,
                                followersCount: user.followers_count || 0,
                                isFollowing: isFollowing
                            };
                        })
                    );
                    
                    results.users = usersWithFollowStatus;
                } else {
                    console.error('Error searching users:', error);
                }
            }

            // Search posts
            if (filter === 'all' || filter === 'posts') {
                const { data: posts, error } = await this.supabase
                    .rpc('search_posts', { 
                        search_query: query,
                        result_limit: 20
                    });
                
                if (!error && posts) {
                    results.posts = posts.map(post => ({
                        id: post.id,
                        userId: post.user_id,
                        content: post.content,
                        createdAt: post.created_at,
                        likes: post.likes_count || 0,
                        comments: post.comments_count || 0,
                        user: {
                            username: post.username,
                            displayName: post.display_name || post.username,
                            avatar: post.avatar_url || 'assets/icons/default-profile.png'
                        }
                    }));
                } else {
                    console.error('Error searching posts:', error);
                }
            }

            // Search hashtags
            if (filter === 'all' || filter === 'hashtags') {
                const { data: hashtags, error } = await this.supabase
                    .rpc('search_hashtags', { 
                        search_query: query,
                        result_limit: 20
                    });
                
                if (!error && hashtags) {
                    results.hashtags = hashtags.map(hashtag => ({
                        name: hashtag.name,
                        count: hashtag.posts_count || 0,
                        recentCount: hashtag.recent_posts_count || 0
                    }));
                } else {
                    console.error('Error searching hashtags:', error);
                }
            }

            // Log search to history if user is logged in
            if (currentUser) {
                const totalResults = Object.values(results).reduce((total, section) => total + section.length, 0);
                await this.supabase.rpc('log_search', {
                    search_user_id: currentUser.id,
                    search_query: query,
                    search_results_count: totalResults,
                    search_type: filter
                });
            }

            return results;

        } catch (error) {
            console.error('Search API error:', error);
            throw error;
        }
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
            <div class="user-card" data-user-id="${user.id}">
                <img src="${user.avatar}" alt="${user.displayName}" class="user-avatar" onerror="this.src='assets/icons/default-profile.png'">
                <div class="user-info">
                    <div class="user-name">${this.escapeHtml(user.displayName)}</div>
                    <div class="user-handle">@${user.username}</div>
                    ${user.bio ? `<div class="user-bio">${this.escapeHtml(user.bio)}</div>` : ''}
                    <div class="user-stats">
                        <span class="follower-count">${user.followersCount.toLocaleString()} followers</span>
                    </div>
                </div>
                <button class="btn btn-sm ${user.isFollowing ? 'btn-secondary' : 'btn-primary'} follow-btn" 
                        onclick="searchManager.handleFollow('${user.id}', this)"
                        ${!getCurrentUser() ? 'disabled' : ''}>
                    ${user.isFollowing ? 'Following' : 'Follow'}
                </button>
            </div>
        `).join('');

        // Add click handlers to user cards
        usersList.querySelectorAll('.user-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // Don't navigate if clicking the follow button
                if (!e.target.closest('.follow-btn')) {
                    const userId = card.dataset.userId;
                    window.location.href = `profile.html?user=${userId}`;
                }
            });
        });
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
            <div class="post-card" data-post-id="${post.id}">
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
                    <button class="post-action like-btn" onclick="searchManager.handleLike('${post.id}', this)" ${!getCurrentUser() ? 'disabled' : ''}>
                        <span>❤️</span>
                        <span class="like-count">${post.likes}</span>
                    </button>
                    <button class="post-action comment-btn" onclick="searchManager.handleComment('${post.id}')" ${!getCurrentUser() ? 'disabled' : ''}>
                        <span>💬</span>
                        <span class="comment-count">${post.comments}</span>
                    </button>
                </div>
            </div>
        `).join('');

        // Add click handlers to post cards
        postsList.querySelectorAll('.post-card').forEach(card => {
            card.addEventListener('click', (e) => {
                // Don't navigate if clicking action buttons
                if (!e.target.closest('.post-actions')) {
                    const postId = card.dataset.postId;
                    // You can implement a post detail page or show modal
                    console.log('View post:', postId);
                }
            });
        });
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
                    ${hashtag.recentCount > 0 ? `<div class="hashtag-recent">${hashtag.recentCount} recent</div>` : ''}
                </div>
            </a>
        `).join('');
    }

    async handleFollow(userId, button) {
        const currentUser = getCurrentUser();
        if (!currentUser) {
            this.showMessage('Please log in to follow users', 'error');
            return;
        }

        try {
            const isCurrentlyFollowing = button.textContent === 'Following';
            
            if (isCurrentlyFollowing) {
                // Unfollow
                const { error } = await this.supabase
                    .from('follows')
                    .delete()
                    .eq('follower_id', currentUser.id)
                    .eq('following_id', userId);
                
                if (!error) {
                    button.textContent = 'Follow';
                    button.classList.remove('btn-secondary');
                    button.classList.add('btn-primary');
                    this.showMessage('Unfollowed user', 'success');
                } else {
                    throw error;
                }
            } else {
                // Follow
                const { error } = await this.supabase
                    .from('follows')
                    .insert({
                        follower_id: currentUser.id,
                        following_id: userId
                    });
                
                if (!error) {
                    button.textContent = 'Following';
                    button.classList.remove('btn-primary');
                    button.classList.add('btn-secondary');
                    this.showMessage('Followed user', 'success');
                } else {
                    throw error;
                }
            }
        } catch (error) {
            console.error('Follow error:', error);
            this.showMessage('Failed to follow user', 'error');
        }
    }

    async handleLike(postId, button) {
        const currentUser = getCurrentUser();
        if (!currentUser) {
            this.showMessage('Please log in to like posts', 'error');
            return;
        }

        try {
            const likeCount = button.querySelector('.like-count');
            const isCurrentlyLiked = button.classList.contains('liked');
            
            if (isCurrentlyLiked) {
                // Unlike
                const { error } = await this.supabase
                    .from('likes')
                    .delete()
                    .eq('user_id', currentUser.id)
                    .eq('post_id', postId);
                
                if (!error) {
                    button.classList.remove('liked');
                    likeCount.textContent = parseInt(likeCount.textContent) - 1;
                    this.showMessage('Post unliked', 'success');
                } else {
                    throw error;
                }
            } else {
                // Like
                const { error } = await this.supabase
                    .from('likes')
                    .insert({
                        user_id: currentUser.id,
                        post_id: postId
                    });
                
                if (!error) {
                    button.classList.add('liked');
                    likeCount.textContent = parseInt(likeCount.textContent) + 1;
                    this.showMessage('Post liked', 'success');
                } else {
                    throw error;
                }
            }
        } catch (error) {
            console.error('Like error:', error);
            this.showMessage('Failed to like post', 'error');
        }
    }

    handleComment(postId) {
        const currentUser = getCurrentUser();
        if (!currentUser) {
            this.showMessage('Please log in to comment', 'error');
            return;
        }
        
        // You can implement comment functionality here
        // For now, just show a message
        this.showMessage('Comment feature coming soon!', 'info');
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
        const resultsState = document.getElementById('searchResultsState');
        if (resultsState) resultsState.style.display = 'block';
        if (noResults) noResults.style.display = 'block';
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
        // Implement search suggestions dropdown (optional)
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

    async loadTrendingHashtags() {
        try {
            const { data: trending, error } = await this.supabase
                .rpc('get_trending_hashtags', { 
                    limit_count: 10,
                    days_back: 7
                });
            
            if (!error && trending) {
                // Update the trending section in your HTML
                const trendingList = document.querySelector('.trending-list');
                if (trendingList) {
                    trendingList.innerHTML = trending.map((item, index) => `
                        <div class="trending-item" onclick="searchManager.searchHashtag('${item.name}')">
                            <span class="trending-rank">${index + 1}</span>
                            <div class="trending-content">
                                <span class="trending-tag">#${item.name}</span>
                                <span class="trending-count">${item.posts_count.toLocaleString()} posts</span>
                            </div>
                        </div>
                    `).join('');
                }
            } else {
                console.error('Error loading trending hashtags:', error);
                // Fallback to mock data
                this.loadMockTrendingHashtags();
            }
        } catch (error) {
            console.error('Error loading trending hashtags:', error);
            // Fallback to mock data
            this.loadMockTrendingHashtags();
        }
    }

    loadMockTrendingHashtags() {
        const mockTrending = [
            { name: 'SocialMedia', posts_count: 2540 },
            { name: 'Tech', posts_count: 1820 },
            { name: 'Uncensored', posts_count: 1200 },
            { name: 'Freedom', posts_count: 950 },
            { name: 'Community', posts_count: 870 }
        ];

        const trendingList = document.querySelector('.trending-list');
        if (trendingList) {
            trendingList.innerHTML = mockTrending.map((item, index) => `
                <div class="trending-item" onclick="searchManager.searchHashtag('${item.name}')">
                    <span class="trending-rank">${index + 1}</span>
                    <div class="trending-content">
                        <span class="trending-tag">#${item.name}</span>
                        <span class="trending-count">${item.posts_count.toLocaleString()} posts</span>
                    </div>
                </div>
            `).join('');
        }
    }

    searchHashtag(hashtag) {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.value = `#${hashtag}`;
            this.performSearch(`#${hashtag}`);
        }
    }

    showMessage(message, type = 'info') {
        // Remove existing message
        const existingMsg = document.querySelector('.status-message');
        if (existingMsg) existingMsg.remove();

        // Create new message
        const messageDiv = document.createElement('div');
        messageDiv.className = `status-message status-${type}`;
        messageDiv.textContent = message;
        messageDiv.style.cssText = `
            position: fixed;
            top: 80px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10000;
            max-width: 90%;
            padding: 12px 20px;
            border-radius: 8px;
            font-weight: 500;
        `;

        document.body.appendChild(messageDiv);

        // Auto remove after 3 seconds
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.parentNode.removeChild(messageDiv);
            }
        }, 3000);
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
        formatted = formatted.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color: var(--primary-color); text-decoration: none;">$1</a>');
        
        // Convert hashtags
        formatted = formatted.replace(/#(\w+)/g, '<span style="color: var(--primary-color); font-weight: 500;">#$1</span>');
        
        // Convert mentions
        formatted = formatted.replace(/@(\w+)/g, '<span style="color: var(--primary-color); font-weight: 500;">@$1</span>');
        
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
        const currentUser = getCurrentUser ? getCurrentUser() : null;
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
    // Make globally available for inline onclick handlers
    window.searchManager = searchManager;
});
